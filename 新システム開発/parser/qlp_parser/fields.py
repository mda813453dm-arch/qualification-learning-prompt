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
    (r"宅地建物取引業|宅地建物取引士", "t7", "宅地建物取引業法"),
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
