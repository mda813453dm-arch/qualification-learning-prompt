"""問題ごとの分野（fieldId）分類。

仕様（総合仕様書・学習計画見直し仕様 2026-10-14）：
- fieldId は学習計画上の分野。問題ごとに内容から根拠付きで分類し、問番号からは決めない。
- 分類できない問題は出題しない（呼び出し側で除外する）。
- unitId は弱点分析用の下位分類（法令名など）。

分類は決まった規則だけで行う（AIに判断させない）。見る順番：
  1. 主題：問題文の「〜に関する次の記述」「〜の規定によれば」「〜について述べたもの」の部分
  2. 問題文の全体
  3. 問題文と選択肢
各段階で、規則を上から順に当て、最初に当たった規則で決める。当たった語を根拠として残す。

分野の表は案（2026-10-15 作成、承認待ち）。公式の出題範囲をもとにしている。
"""

import re
import unicodedata

# 宅建：宅地建物取引業法施行規則 第8条の試験の内容（7項目）
TAKKEN_FIELDS = {
    "t1": "土地・建物の形質・構造",
    "t2": "権利と権利の変動（民法・借地借家法・区分所有法・不動産登記法）",
    "t3": "法令上の制限",
    "t4": "税",
    "t5": "需給と実務（住宅金融支援機構・景品表示法・統計）",
    "t6": "価格の評定（地価公示・鑑定評価）",
    "t7": "宅地建物取引業法と関係法令",
}

# (正規表現, fieldId, unitId)。上にあるものほど優先。
TAKKEN_RULES = [
    (r"不当景品類|景品表示法|公正競争規約", "t5", "景品表示法"),
    (r"住宅金融支援機構", "t5", "住宅金融支援機構"),
    (r"統計|着工", "t5", "統計"),
    (r"地価公示", "t6", "地価公示法"),
    (r"鑑定評価", "t6", "不動産鑑定評価基準"),
    (r"所得税|住民税|登録免許税|不動産取得税|固定資産税|印紙税|贈与税|相続税|譲渡所得", "t4", "税"),
    (r"住宅瑕疵担保|特定住宅瑕疵", "t7", "住宅瑕疵担保履行法"),
    (r"犯罪による収益の移転防止", "t7", "犯罪収益移転防止法"),
    # OCRで「建」が「填」「乾」などに読まれることがあるので、1字は任意の字を許す
    (r"宅地.物取引業|宅地.物取引士|宅建業者|37条書面|重要事項説明|媒介契約|営業保証金|保証協会|クーリング・オフ", "t7", "宅地建物取引業法"),
    (r"都市計画法", "t3", "都市計画法"),
    (r"建築基準法", "t3", "建築基準法"),
    (r"宅地造成|盛土", "t3", "宅地造成及び特定盛土等規制法"),
    (r"土地区画整理", "t3", "土地区画整理法"),
    (r"農地", "t3", "農地法"),
    (r"国土利用計画法", "t3", "国土利用計画法"),
    (r"建物の区分所有|区分所有法", "t2", "区分所有法"),
    (r"不動産の登記|不動産登記", "t2", "不動産登記法"),
    (r"借地借家法", "t2", "借地借家法"),
    (r"民法", "t2", "民法"),
    (r"建物の構造|建築物の構造|構造と材料|材料", "t1", "建物"),
    (r"^土地に関する|土地の形質|地形|地盤", "t1", "土地"),
    # 法令名が書かれていない民法の問題（主題の語で決める）
    (r"地役権|抵当権|根抵当|質権|留置権|相続|遺言|遺留分|賃貸借|使用貸借|債務|債権|売買契約|請負|委任|代理|時効|共有|不法行為|贈与|物権", "t2", "民法"),
]

# 測量士補：測量士補試験の試験科目（8科目）
SURVEYOR_FIELDS = {
    "s1": "測量に関する法規",
    "s2": "多角測量",
    "s3": "GNSS測量",
    "s4": "水準測量",
    "s5": "地形測量",
    "s6": "写真測量",
    "s7": "地図編集",
    "s8": "応用測量",
}

SURVEYOR_RULES = [
    (r"測量法|測量計画機関|測量作業機関", "s1", "測量法"),
    (r"水準測量|標高測量|レベル|標尺|水準点", "s4", "水準測量"),
    (r"GNSS|ＧＮＳＳ", "s3", "GNSS測量"),
    (r"細部測量|数値地形図|等高線|地形測量|地上レーザ", "s5", "地形測量"),
    (r"空中写真|写真測量|航空カメラ|航空レーザ|UAV|ＵＡＶ|空中三角|オルソ|ステレオ", "s6", "写真測量"),
    (r"路線測量|河川測量|用地測量|円曲線|曲線半径|境界点|縦断|横断|面積", "s8", "応用測量"),
    (r"地図投影|地図編集|電子地形図|地形図|GIS|ＧＩＳ|ベクタ|ラスタ|地理院地図|平面直角座標", "s7", "地図編集"),
    (r"トータルステーション|TS|ＴＳ|多角|基準点測量|水平角|器械高|偏心", "s2", "多角測量"),
]

_TOPIC = [
    re.compile(r"^(.*?)に関する次の"),
    re.compile(r"([^、。]*?)(?:（[^）]*）)?の規定(?:及び判例)?によれば"),
    re.compile(r"^(.*?)について述べたもの"),
]


def _norm(text):
    return unicodedata.normalize("NFKC", text or "")


def _topic(stem):
    head = stem.split("。")[0]
    for pat in _TOPIC:
        m = pat.search(head)
        if m and m.group(1).strip():
            return m.group(1)
    return ""


def classify_by_rules(rules, stem, choices=()):
    """規則で分類する。返り値 {fieldId, unitId, method, evidence, verified}。分類できなければ fieldId=None。"""
    stem = _norm(stem)
    tiers = [("topic", _topic(stem)), ("stem", stem), ("stem_and_choices", stem + "\n" + "\n".join(_norm(c) for c in choices))]
    for tier, text in tiers:
        if not text:
            continue
        for pattern, field_id, unit_id in rules:
            m = re.search(pattern, text)
            if m:
                return {"fieldId": field_id, "unitId": unit_id, "method": f"rule:{tier}", "evidence": m.group(0), "verified": True}
    return {"fieldId": None, "unitId": None, "method": "unclassified", "evidence": None, "verified": False}


def classify_takken(question):
    return classify_by_rules(TAKKEN_RULES, question.stem, question.choices)


def classify_surveyor(question):
    return classify_by_rules(SURVEYOR_RULES, question.stem, question.choices)

# 賃貸不動産経営管理士：試験の出題範囲（賃貸不動産経営管理士協議会の試験案内にある6項目）
CHINTAI_FIELDS = {
    "c1": "管理受託契約に関する事項",
    "c2": "管理業務として行う賃貸住宅の維持保全に関する事項",
    "c3": "家賃、敷金、共益費その他の金銭の管理に関する事項",
    "c4": "賃貸住宅の賃貸借に関する事項",
    "c5": "賃貸住宅管理業法に関する事項",
    "c6": "そのほかの賃貸住宅の管理の実務に関する事項",
}

CHINTAI_RULES = [
    (r"特定賃貸借|サブリース|マスターリース|特定転貸|勧誘者|誇大広告|不当な勧誘", "c5", "特定賃貸借契約（サブリース）"),
    (r"管理受託契約|管理受託|委託者", "c1", "管理受託契約"),
    (r"賃貸住宅管理業法|賃貸住宅の管理業務等の適正化|業務管理者|賃貸住宅管理業の登録", "c5", "賃貸住宅管理業法"),
    (r"家賃|敷金|共益費|金銭の管理|分別管理|会計|仕訳|滞納|未収|供託|少額訴訟|明渡し|明け渡し", "c3", "金銭の管理"),
    (r"委任契約|委任", "c1", "管理受託契約"),
    (r"維持保全|修繕|点検|設備|給水|排水|換気|電気|ガス|消防|防火|耐震|建築基準法|雨水|屋根|外壁|防犯|鍵|原状回復|エレベーター|昇降機|給湯|建ぺい率|容積率|避難|建物の構造|工法|応急危険度|罹.?災|地震|住環境|居住ルール|苦情", "c2", "維持保全"),
    (r"賃貸借|借地借家法|更新|解約|定期建物|使用貸借|保証|転貸|相続|成年後見|賃借人|賃貸人|民法|相隣|損害賠償|工作物|不法行為|登記|賃料増減|賃料", "c4", "賃貸借"),
    (r"税|相続税|固定資産|所得|保険|不動産証券化|企画提案|個人情報|障害者|住宅セーフティネット|統計|宅建業法|宅地建物取引業|募集|広告|重要事項|賃貸不動産経営管理士|プロパティマネジメント|アセットマネジメント|管理業者の役割|住生活基本|コンセプト|土地の価格|地価|鑑定評価|空家|空き家|政策課題", "c6", "管理の実務"),
    (r"賃貸住宅管理業者|登録", "c5", "賃貸住宅管理業法"),
]


def classify_chintai(question):
    return classify_by_rules(CHINTAI_RULES, question.stem, question.choices)


# FP技能検定（2級・3級）：学科試験の6分野（試験科目）
FP_FIELDS = {
    "f1": "ライフプランニングと資金計画",
    "f2": "リスク管理",
    "f3": "金融資産運用",
    "f4": "タックスプランニング",
    "f5": "不動産",
    "f6": "相続・事業承継",
}

FP_RULES = [
    (r"相続|遺言|遺産|遺留分|贈与|事業承継|相続税|贈与税|後見|自社株|非上場株式|親族", "f6", "相続・事業承継"),
    (r"不動産|借地|借家|建築基準|都市計画|区分所有|登記|固定資産税|不動産取得税|土地|建物|宅地|容積率|建蔽率|建ぺい率|農地|鑑定評価|地価", "f5", "不動産"),
    (r"所得税|住民税|法人税|消費税|所得控除|税額控除|青色申告|確定申告|源泉徴収|必要経費|損益通算|課税|非課税|控除", "f4", "タックスプランニング"),
    (r"保険|共済|保障|特約|損害|賠償|ソルベンシー|契約者保護", "f2", "リスク管理"),
    (r"株式|債券|投資信託|預金|金利|為替|ＮＩＳＡ|NISA|ポートフォリオ|利回り|金融商品|ＥＴＦ|ETF|REIT|デリバティブ|オプション|日経平均|ＧＤＰ|GDP|景気|日本銀行|マネーストック|外貨|金融サービス|国債|消費者契約法|犯罪による収益|犯罪収益|ＲＯＥ|ROE|ＰＥＲ|PER|ファンド|シャープレシオ", "f3", "金融資産運用"),
    (r"年金|雇用保険|健康保険|介護保険|労災|労働者災害|社会保険|キャッシュフロー|ライフプラン|教育資金|住宅ローン|奨学金|教育ローン|ファイナンシャル・プランナー|ＦＰ|クレジットカード|退職|資金計画|係数|中小企業|決算書|損益計算書|貸借対照表|財務分析", "f1", "ライフプランニングと資金計画"),
]


FP_ORDER = ["f1", "f2", "f3", "f4", "f5", "f6"]


def classify_fp(question, block):
    """FP（日本FP協会）の学科試験は、試験の決まりで分野ごとに問の範囲が決まっている
    （2級：10問ずつ、3級：正誤式・三答択一式それぞれ5問ずつ、ライフ→リスク→金融→タックス→不動産→相続の順）。
    その範囲で分野を決め、内容の規則は根拠として添える。"""
    n = question.number
    k = ((n - 1) % 30) // 5 if block == 5 else (n - 1) // block
    if not 0 <= k < len(FP_ORDER):
        return classify_by_rules(FP_RULES, question.stem, question.choices)
    hit = classify_by_rules(FP_RULES, question.stem, question.choices)
    return {"fieldId": FP_ORDER[k], "unitId": FP_FIELDS[FP_ORDER[k]], "method": "official_order",
            "evidence": f"問{n}（試験の出題順）" + (f"・{hit['evidence']}" if hit["fieldId"] == FP_ORDER[k] else ""), "verified": True}



ITPASS_FIELDS = {"s": "ストラテジ系", "m": "マネジメント系", "t": "テクノロジ系"}


def classify_itpass(question):
    """ITパスポートの公開問題は、冊子の案内（「問1から問34までは、ストラテジ系の問題です。」）で分野の範囲が決まる。
    案内が読めなかった問は分野を決めない（出題しない）。"""
    n = question.number
    fid = next((x.split(":", 1)[1] for x in question.notes if x.startswith("field:")), None)
    if fid not in ITPASS_FIELDS:
        return {"fieldId": None, "method": "official_banner", "evidence": f"問{n}", "verified": False}
    return {"fieldId": fid, "unitId": ITPASS_FIELDS[fid], "method": "official_banner", "evidence": f"問{n}（問題冊子の分野の案内）", "verified": True}


# 行政書士：試験の区分（行政書士試験研究センターの試験案内）。区分ごとの問番号の範囲は平成18年度以降同じ
GYOSEI_FIELDS = {
    "g1": "基礎法学",
    "g2": "憲法",
    "g3": "行政法",
    "g4": "民法",
    "g5": "商法・会社法",
    "g6": "基礎知識",
}

GYOSEI_RANGES = [(1, 2, "g1"), (3, 7, "g2"), (8, 26, "g3"), (27, 35, "g4"), (36, 40, "g5"), (47, 60, "g6")]


def classify_gyosei(question):
    for lo, hi, field_id in GYOSEI_RANGES:
        if lo <= question.number <= hi:
            return {"fieldId": field_id, "unitId": GYOSEI_FIELDS[field_id], "method": "official_number_range",
                    "evidence": f"問題{lo}〜{hi}", "verified": True}
    return {"fieldId": None, "unitId": None, "method": "unclassified", "evidence": None, "verified": False}


# 中小企業診断士 第1次試験：試験科目（7科目）。1冊が1科目なので、分野は表紙の科目名で決まる
SHINDAN_FIELDS = {
    "d1": "経済学・経済政策",
    "d2": "財務・会計",
    "d3": "企業経営理論",
    "d4": "運営管理（オペレーション・マネジメント）",
    "d5": "経営法務",
    "d6": "経営情報システム",
    "d7": "中小企業経営・中小企業政策",
}


def classify_shindan(question):
    name = next((x.split(":", 1)[1] for x in question.notes if x.startswith("subject:")), None)
    fid = next((k for k, v in SHINDAN_FIELDS.items() if v == name), None)
    if not fid:
        return {"fieldId": None, "unitId": None, "method": "official_subject", "evidence": None, "verified": False}
    return {"fieldId": fid, "unitId": name, "method": "official_subject", "evidence": f"問題冊子の表紙（{name}）", "verified": True}


# マンション管理士：学習用の分野（過去問の問題の並びと内容から。公式の区分ではない）
MANKAN_FIELDS = {
    "k1": "マンションの管理に関する法令及び実務",
    "k2": "管理組合の運営の円滑化",
    "k3": "マンションの建物及び附属施設の構造及び設備",
    "k4": "マンション管理適正化法",
}

# (正規表現, fieldId, unitId)。上にあるものほど優先。問46〜50（マンション管理適正化法）は問番号で決める
MANKAN_RULES = [
    (r"仕訳|会計|収支|貸借対照表|予算|管理費等の滞納|消費税|法人税", "k2", "管理組合の会計"),
    (r"総会|理事会|理事長|役員|議決権行使書", "k2", "管理組合の運営"),
    (r"標準管理規約", "k2", "標準管理規約"),
    (r"長期修繕計画|大規模修繕|修繕積立金", "k3", "長期修繕計画・修繕"),
    (r"建築基準法|消防法|水道法|給水|排水|換気|電気設備|エレベーター|昇降機|防犯|耐震|劣化|外壁|コンクリート|防水|屋根|塗装|避難|構造|設備|断熱|遮音|バリアフリー", "k3", "建物・設備"),
    (r"被災区分所有|建替え等の円滑化|建替え等円滑化|マンション建替|マンションの建替え", "k1", "建替え・被災"),
    (r"不動産登記|登記", "k1", "不動産登記法"),
    (r"区分所有法|区分所有者|管理者|集会|規約|共用部分|専有部分|敷地利用権|管理組合法人|団地", "k1", "区分所有法"),
    (r"借地借家法|宅地建物取引業法|品確法|住宅の品質確保|個人情報|都市計画法|景品表示|消費者契約", "k1", "関係法令"),
    (r"民法|相続|遺言|賃貸借|売買|抵当権|時効|不法行為|委任|請負|保証|債務|債権|代理", "k1", "民法"),
]


def classify_mankan(question):
    if 46 <= question.number <= 50:
        return {"fieldId": "k4", "unitId": MANKAN_FIELDS["k4"], "method": "official_number_range",
                "evidence": "問46〜50（マンション管理適正化法）", "verified": True}
    return classify_by_rules(MANKAN_RULES, question.stem, question.choices)
