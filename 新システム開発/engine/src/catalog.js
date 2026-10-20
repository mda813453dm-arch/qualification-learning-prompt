/**
 * プロンプトだけで使う方式（pages.js）で扱う資格の台帳。
 * 公式PDFのURLはプログラムが持つ（AIに探させない）。URLは公式サイトで確認済みのものだけを書く。
 */
export const CATALOG = {
  takken: {
    qualificationId: 'q041',
    name: '宅地建物取引士（宅建）',
    // 利用者が自由に入力した資格名と照らし合わせるための呼び方
    aliases: ['宅建', '宅建士', '宅地建物取引士', '宅地建物取引主任者', '宅建試験'],
    org: '一般財団法人 不動産適正取引推進機構（RETIO）',
    officialSite: 'https://www.retio.or.jp/exam/index.html',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.retio.or.jp/exam/exam_detail/',
    overview: [
      ['試験日', '毎年1回、10月の第3日曜日（令和8年度は10月18日（日））'],
      ['試験時間', '午後1時〜午後3時（2時間）。登録講習修了者は午後1時10分〜午後3時（1時間50分）'],
      ['試験の方法', '50問・四肢択一式による筆記試験。ただし、登録講習修了者は45問'],
      ['受験資格', '日本国内に居住する方であれば、年齢、学歴等に関係なく、誰でも受験できます。'],
      ['試験地', '原則として、現在お住まいの試験地（都道府県）での受験'],
      ['受験手数料', '8,200円（非課税）'],
      ['受験申込み', 'インターネットは7月上旬から下旬まで、郵送は7月上旬から7月中旬まで'],
      ['実施公告', '原則として、毎年6月の第1金曜日'],
      ['合格発表', '原則として、11月下旬'],
      ['試験の基準', '宅地建物取引業に関する実用的な知識を有するかどうかを判定することに基準が置かれています。'],
      ['合格後', '宅地建物取引士となるには、受験地の都道府県知事の資格登録と、宅地建物取引士証の交付が必要'],
      ['対象年度', '令和8年度（2026年度）'],
      ['法令基準日', '2026年4月1日'],
    ],
    subjects: [
      '土地の形質、地積、地目及び種別、建物の形質、構造及び種別',
      '土地・建物の権利及び権利の変動に関する法令',
      '土地・建物の法令上の制限',
      '宅地・建物の税に関する法令',
      '宅地・建物の需給に関する法令及び実務',
      '宅地・建物の価格の評定',
      '宅地建物取引業法及び関係法令',
    ],
    pastExamPage: 'https://www.retio.or.jp/exam/past_ques_ans/other/',
    // 公式の免除制度：登録講習の修了者は問46〜50の5問が免除
    exemption: { label: '登録講習の修了による5問免除（問46〜50）', numbers: [46, 47, 48, 49, 50] },
    // 分野の分け方（parser/qlp_parser/fields.py と同じ。2026-10-15 確定）
    // 並びは学習計画の順（出題数の多い分野から）。分野別の出題数は、RETIO の概要と予備校の解説（3か所）で一致：宅建業法20問、権利関係14問、法令上の制限8問、税・その他8問（うち免除5問）。
    // 3か所の数字が一致したので、その数字の順に並べる。エンジンの分野のうち、土地・建物の形質・構造は法令上の制限の区分に入れ、税・その他の中は並べ替えず試験案内の順のまま
    fields: {
      t7: '宅地建物取引業法と関係法令',
      t2: '権利と権利の変動（民法・借地借家法・区分所有法・不動産登記法）',
      t3: '法令上の制限',
      t1: '土地・建物の形質・構造',
      t4: '税',
      t5: '需給と実務（住宅金融支援機構・景品表示法・統計）',
      t6: '価格の評定（地価公示・鑑定評価）',
    },
    sources: [
      { adapter: 'takken', year: 2025, section: 'main', questionUrl: 'https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf', answerUrl: null },
    ],
  },
  surveyor: {
    qualificationId: 'q063',
    name: '測量士補',
    aliases: ['測量士補', '測量士補試験', '測量士補の国家試験'],
    org: '国土地理院',
    officialSite: 'https://www.gsi.go.jp/LAW/SHIKEN/SHIKEN-top.htm',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.gsi.go.jp/common/000273935.pdf',
    overview: [
      ['受験資格', '学歴、年齢、性別、実務経験及び国籍に関係なく受験できます。'],
      ['試験方法', '筆記試験（択一式）。出題数は計28問'],
      ['試験日', '令和8年度は5月17日（日）午後1時30分〜午後4時30分（例年5月中〜下旬の日曜日）'],
      ['試験科目', '①測量に関する法規 ②測地測量 ③測図測量 ④応用測量（三次元点群測量についても出題）'],
      ['合格基準', '1問当たり25点で700点満点。450点以上の者が合格'],
      ['受験手数料', '令和8年度は2,850円（書面申請）、2,800円（電子申請）'],
      ['試験地', '北海道・宮城県・秋田県・東京都・新潟県・富山県・愛知県・大阪府・島根県・広島県・香川県・福岡県・鹿児島県・沖縄県'],
      ['合格発表', '令和8年度は6月25日（木）午前9時'],
      ['対象年度', '令和8年度'],
    ],
    pastExamPage: 'https://www.gsi.go.jp/LAW/SHIKEN/past.html',
    exemption: null,
    fields: {
      s1: '測量に関する法規',
      s2: '多角測量',
      s3: 'GNSS測量',
      s4: '水準測量',
      s5: '地形測量',
      s6: '写真測量',
      s7: '地図編集',
      s8: '応用測量',
    },
    sources: [
      { adapter: 'surveyor', year: 2026, section: 'main', questionUrl: 'https://www.gsi.go.jp/common/000278974.pdf', answerUrl: 'https://www.gsi.go.jp/common/000278975.pdf' },
    ],
  },
  chintai: {
    qualificationId: 'q097',
    name: '賃貸不動産経営管理士（賃管）',
    aliases: ['賃管', '賃貸不動産経営管理士', '賃貸管理士', '賃貸不動産管理士'],
    org: '一般社団法人 賃貸不動産経営管理士協議会',
    officialSite: 'https://www.chintaikanrishi.jp/',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.chintaikanrishi.jp/exam/summary',
    overview: [
      ['試験日時', '令和8年度は11月15日（日）13:00〜15:00（120分間）。年1回'],
      ['出題形式・問題数', '四肢択一、50問（令和7・8年度の賃貸不動産経営管理士講習修了者は45問）'],
      ['出題範囲', '管理受託契約、維持保全、金銭管理、賃貸借、法令、その他管理実務の6区分'],
      ['受験要件', '日本国内に居住していれば、年齢・性別・学歴等に制約はない'],
      ['試験会場', '全国41地域'],
      ['受験手数料', '12,000円'],
      ['合格発表', '令和8年度は12月24日（木）（予定）'],
      ['登録', '管理業務の実務経験2年以上、または同等以上の能力を有すること。登録料6,600円（税込）'],
      ['出題基準日', '令和8年4月1日時点で施行されている法令・告示・通知と、同日時点で公表されている統計データに基づく'],
    ],
    subjects: [
      '管理受託契約',
      '維持保全',
      '金銭管理',
      '賃貸借',
      '法令',
      'その他管理実務',
    ],
    pastExamPage: 'https://www.chintaikanrishi.jp/exam/past/',
    // 公式の免除制度：賃貸不動産経営管理士講習の修了者は5問免除（問46〜50）
    exemption: { label: '賃貸不動産経営管理士講習の修了による5問免除（問46〜50）', numbers: [46, 47, 48, 49, 50] },
    // 分野の分け方（parser/qlp_parser/fields.py と同じ。協議会の試験案内の出題範囲6項目）
    fields: {
      c1: '管理受託契約に関する事項',
      c2: '管理業務として行う賃貸住宅の維持保全に関する事項',
      c3: '家賃、敷金、共益費その他の金銭の管理に関する事項',
      c4: '賃貸住宅の賃貸借に関する事項',
      c5: '賃貸住宅管理業法に関する事項',
      c6: 'そのほかの賃貸住宅の管理の実務に関する事項',
    },
    sources: [
      { adapter: 'chintai', year: 2025, section: 'main', questionUrl: 'https://www.chintaikanrishi.jp/assets/common/else/past_question_2025.pdf', answerUrl: 'https://www.chintaikanrishi.jp/assets/common/else/past_answer_2025.pdf' },
    ],
  },
  fp2: {
    qualificationId: 'q002',
    name: 'FP技能検定2級（学科）',
    aliases: ['FP2級', 'ＦＰ2級', 'FP２級', 'ＦＰ２級', '2級FP', '２級ＦＰ', 'FP技能検定2級', '2級ファイナンシャル・プランニング技能士', 'ファイナンシャルプランナー2級', 'ファイナンシャル・プランナー2級'],
    org: '特定非営利活動法人 日本ファイナンシャル・プランナーズ協会',
    officialSite: 'https://www.jafp.or.jp/exam/',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.jafp.or.jp/exam/outline/3fp.shtml',
    overview: [
      ['実施方式', '原則としてCBT方式。テストセンターの空いている日時から選択可能'],
      ['試験時間', '120分'],
      ['問題数・出題形式', '60問・多肢選択式'],
      ['合格基準', '36点以上（60点満点）'],
      ['受検資格', '3級FP技能検定の合格者／FP業務に関し2年以上の実務経験を有する者／AFP認定研修を修了している者／金融渉外技能審査3級の合格者（いずれか）'],
      ['受検手数料', '5,700円（非課税）'],
      ['合格発表', '受検日の翌月中旬'],
    ],
    subjects: [
      'A ライフプランニングと資金計画：ファイナンシャル・プランニングと倫理・関連法規、ライフプランニングの考え方・手法、社会保険、公的年金、企業年金・個人年金等、年金と税金、ライフプラン策定上の資金計画、中小法人の資金計画、ローンとカード',
      'B リスク管理：リスクマネジメント、保険制度全般、生命保険、損害保険、第三分野の保険、リスク管理と保険',
      'C 金融資産運用：マーケット環境の理解、預貯金・金融類似商品等、投資信託、債券投資、株式投資、外貨建商品、保険商品、金融派生商品、ポートフォリオ運用、金融商品と税金、セーフティネット、関連法規',
      'D タックスプランニング：わが国の税制、所得税の仕組み、各種所得の内容、損益通算、所得控除、税額控除、所得税の申告と納付、個人住民税、個人事業税、法人税、法人住民税、法人事業税、消費税、会社・役員間および会社間の税務、決算書と法人税申告書、諸外国の税制度',
      'E 不動産：不動産の見方、不動産の取引、不動産に関する法令上の規制、不動産の取得・保有に係る税金、不動産の譲渡に係る税金、不動産の賃貸、不動産の有効活用、不動産の証券化',
      'F 相続・事業承継：贈与と法律、贈与と税金、相続と法律、相続と税金、相続財産の評価（不動産以外・不動産）、不動産の相続対策、相続と保険の活用、事業承継対策、事業と経営',
    ],
    pastExamPage: 'https://www.jafp.or.jp/exam/mohan/',
    exemption: null,
    // 学科試験の6分野（出題順に10問ずつ。parser/qlp_parser/fields.py）
    fields: {
      f1: 'ライフプランニングと資金計画',
      f2: 'リスク管理',
      f3: '金融資産運用',
      f4: 'タックスプランニング',
      f5: '不動産',
      f6: '相続・事業承継',
    },
    sources: [
      { adapter: 'fp2', year: 2026, section: '2026年5月', questionUrl: 'https://www.jafp.or.jp/exam/mohan/files/g2_202605_qa.pdf', answerUrl: null },
    ],
  },
  fp3: {
    qualificationId: 'q003',
    name: 'FP技能検定3級（学科）',
    aliases: ['FP3級', 'ＦＰ3級', 'FP３級', 'ＦＰ３級', '3級FP', '３級ＦＰ', 'FP技能検定3級', '3級ファイナンシャル・プランニング技能士', 'ファイナンシャルプランナー3級', 'ファイナンシャル・プランナー3級'],
    org: '特定非営利活動法人 日本ファイナンシャル・プランナーズ協会',
    officialSite: 'https://www.jafp.or.jp/exam/',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.jafp.or.jp/exam/outline/3fp.shtml',
    overview: [
      ['実施方式', '原則としてCBT方式。テストセンターの空いている日時から選択可能'],
      ['試験時間', '90分'],
      ['問題数・出題形式', '60問・多肢選択式'],
      ['合格基準', '36点以上（60点満点）'],
      ['受検資格', 'FP業務に従事している者または従事しようとしている者'],
      ['受検手数料', '4,000円（非課税）'],
      ['合格発表', '受検日の翌月中旬'],
    ],
    subjects: [
      'A ライフプランニングと資金計画：ファイナンシャル・プランニングと倫理・関連法規、ライフプランニングの考え方・手法、社会保険、公的年金、企業年金・個人年金等、年金と税金、ライフプラン策定上の資金計画、ローンとカード',
      'B リスク管理：リスクマネジメント、保険制度全般、生命保険、損害保険、第三分野の保険、リスク管理と保険',
      'C 金融資産運用：マーケット環境の理解、預貯金・金融類似商品等、投資信託、債券投資、株式投資、外貨建商品、保険商品、金融派生商品、ポートフォリオ運用、金融商品と税金、セーフティネット、関連法規',
      'D タックスプランニング：わが国の税制、所得税の仕組み、各種所得の内容、損益通算、所得控除、税額控除、所得税の申告と納付、個人住民税、個人事業税',
      'E 不動産：不動産の見方、不動産の取引、不動産に関する法令上の規制、不動産の取得・保有に係る税金、不動産の譲渡に係る税金、不動産の賃貸、不動産の有効活用、不動産の証券化',
      'F 相続・事業承継：贈与と法律、贈与と税金、相続と法律、相続と税金、相続財産の評価（不動産以外・不動産）、不動産の相続対策、相続と保険の活用',
    ],
    pastExamPage: 'https://www.jafp.or.jp/exam/mohan/',
    exemption: null,
    // 学科試験の6分野（正誤式・三答択一式それぞれ出題順に5問ずつ）
    fields: {
      f1: 'ライフプランニングと資金計画',
      f2: 'リスク管理',
      f3: '金融資産運用',
      f4: 'タックスプランニング',
      f5: '不動産',
      f6: '相続・事業承継',
    },
    sources: [
      { adapter: 'fp3', year: 2026, section: '2026年5月', questionUrl: 'https://www.jafp.or.jp/exam/mohan/files/g3_202605_qa.pdf', answerUrl: null },
    ],
  },
  itpass: {
    qualificationId: 'q006',
    name: 'ITパスポート試験',
    aliases: ['ITパスポート', 'ＩＴパスポート', 'iパス', 'アイパス', 'ITパス', 'ITパスポート試験'],
    org: '独立行政法人情報処理推進機構（IPA）',
    officialSite: 'https://www3.jitec.ipa.go.jp/JitesCbt/',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.ipa.go.jp/shiken/kubun/ip.html',
    overview: [
      ['実施方式・実施時期', 'CBT方式により随時実施'],
      ['試験時間', '120分'],
      ['出題形式', '多肢選択式（四肢択一）'],
      ['出題数', '100問（小問形式）'],
    ],
    pastExamPage: 'https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/questions.html',
    exemption: null,
    // 分野（公開問題の冊子の案内「問1から問34までは、ストラテジ系の問題です。」で決まる。parser/qlp_parser/fields.py）
    fields: {
      s: 'ストラテジ系',
      m: 'マネジメント系',
      t: 'テクノロジ系',
    },
    // IPAのサイトはクラウドからの取得を断る（2026-10-17 確認）。運営者が添付したPDFを保管場所に置き、そこから読む（src/source-store.js）
    sources: [
      { adapter: 'itpass', year: 2026, section: '公開問題', questionUrl: 'https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/2026r08_ip_qs.pdf', answerUrl: 'https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/2026r08_ip_ans.pdf' },
    ],
  },
  gyosei: {
    qualificationId: 'q090',
    name: '行政書士',
    aliases: ['行政書士', '行政書士試験', '行書'],
    org: '一般財団法人 行政書士試験研究センター',
    officialSite: 'https://gyosei-shiken.or.jp/',
    // 公式ページに書かれている概要（文言は公式のまま。2026-10-19に確認。書かれていない項目は載せない）
    overviewSource: 'https://gyosei-shiken.or.jp/doc/abstract/abstract.html',
    overview: [
      ['試験日及び時間', '毎年1回、11月の第2日曜日 午後1時から午後4時まで（令和8年度は11月8日（日））'],
      ['受験資格', '年齢、学歴、国籍等に関係なく、どなたでも受験できます。'],
      ['試験科目', '行政書士の業務に関し必要な法令等（出題数46題：憲法、行政法、民法、商法及び基礎法学）／行政書士の業務に関し必要な基礎知識（出題数14題：一般知識、行政書士法等の諸法令、情報通信・個人情報保護、文章理解）'],
      ['試験の方法', '筆記試験。法令等は択一式及び記述式、基礎知識は択一式'],
      ['配点（令和7年度）', '合計60問・300点（法令等46問244点：五肢択一40問160点、多肢選択3問24点、記述3問60点／基礎知識14問56点）'],
      ['合格基準点（令和7年度）', '法令等122点以上、基礎知識24点以上、試験全体180点以上のすべてを満たすこと'],
      ['受験手数料', '10,400円'],
      ['試験場所', '毎年7月の第2週に公示。全国の試験場で受験できます。'],
      ['合格発表', '令和8年度は令和9年1月27日（水）'],
    ],
    pastExamPage: 'https://gyosei-shiken.or.jp/doc/exam/index.html',
    exemption: null,
    // 分野（試験の区分。問番号の範囲で決まる。parser/qlp_parser/fields.py）。出題するのは5肢択一式だけ
    fields: {
      g1: '基礎法学',
      g2: '憲法',
      g3: '行政法',
      g4: '民法',
      g5: '商法・会社法',
      g6: '基礎知識',
    },
    // 正解はPDFがなく、正解ページ（HTML）の表から読む
    sources: [
      { adapter: 'gyosei', year: 2025, section: '年度共通', questionUrl: 'https://gyosei-shiken.or.jp/pdf/r7_mondai.pdf', answerUrl: 'https://gyosei-shiken.or.jp/doc/exam/r7ans.html' },
    ],
  },
  shindan: {
    qualificationId: 'q021',
    name: '中小企業診断士',
    aliases: ['中小企業診断士', '診断士', '中小企業診断士試験', '中小企業診断士第1次試験', '中小企業診断士1次試験'],
    org: '一般社団法人 中小企業診断協会',
    officialSite: 'https://www.jf-cmca.jp/',
    // 公式の「令和８年度中小企業診断士第１次試験案内」に書かれている概要（文言は公式のまま。2026-10-20に確認。書かれていない項目は載せない）
    overviewSource: 'https://www.jf-cmca.jp/attach/test/r08/r08_1ji_annai.pdf',
    overview: [
      ['試験の目的および方法', '第１次試験は、中小企業診断士となるのに必要な学識を有するかどうかを判定することを目的とし、筆記の方法により行います。'],
      ['受験資格', '第１次試験の受験資格は、年齢、学歴などに制限はありません。'],
      ['試験日（令和8年度 第1次試験）', '８月１日（土）・２日（日）'],
      ['試験科目と時間', '８月１日：経済学・経済政策（60分）、財務・会計（60分）、企業経営理論（90分）、運営管理（90分）／８月２日：経営法務（60分）、経営情報システム（60分）、中小企業経営・中小企業政策（90分）。各100点'],
      ['出題形式', 'マークシート方式による多肢選択式で実施します。'],
      ['受験手数料', '１７，２００円（非課税）'],
      ['合格発表日', '９月１日（火）'],
      ['科目合格による免除', '令和７年度または令和６年度に科目合格された方は、当該科目が申請により免除されます'],
    ],
    subjects: [
      '経済学・経済政策',
      '財務・会計',
      '企業経営理論',
      '運営管理（オペレーション・マネジメント）',
      '経営法務',
      '経営情報システム',
      '中小企業経営・中小企業政策',
    ],
    pastExamPage: 'https://www.jf-cmca.jp/contents/010_c_/shikenmondai.html',
    // 科目合格・他資格による科目免除は科目ごとで、問番号の免除ではない
    exemption: null,
    // 分野は第1次試験の科目（1冊が1科目。parser/qlp_parser/fields.py）。出題するのは択一式の第1次試験だけ（第2次試験は記述式で公式の正解が無い）
    fields: {
      d1: '経済学・経済政策',
      d2: '財務・会計',
      d3: '企業経営理論',
      d4: '運営管理（オペレーション・マネジメント）',
      d5: '経営法務',
      d6: '経営情報システム',
      d7: '中小企業経営・中小企業政策',
    },
    // 区分は科目名。正解は年度ごとの正解ページから科目ごとのPDFを探す（discover.js）。ここは掲載ページが開けないときの控え（令和8年度）
    sources: [
      { adapter: 'shindan', year: 2026, section: '経済学・経済政策', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/A1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026A.pdf' },
      { adapter: 'shindan', year: 2026, section: '財務・会計', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/B1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026B.pdf' },
      { adapter: 'shindan', year: 2026, section: '企業経営理論', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/C1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026C.pdf' },
      { adapter: 'shindan', year: 2026, section: '運営管理（オペレーション・マネジメント）', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/D1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026D.pdf' },
      { adapter: 'shindan', year: 2026, section: '経営法務', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/E1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026E.pdf' },
      { adapter: 'shindan', year: 2026, section: '経営情報システム', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/F1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026F.pdf' },
      { adapter: 'shindan', year: 2026, section: '中小企業経営・中小企業政策', questionUrl: 'https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2026/G1JC2026.pdf', answerUrl: 'https://www.jf-cmca.jp/attach/test/r08/1ji_seikai/2026G.pdf' },
    ],
  },
};

/**
 * 学習の段階（マスタープロンプト U03・ChatGPT開発版の仕様：未着手／基礎／応用／過去問）。
 * mode：分野の始め方（U07）のおすすめ。1=解説あり 2=確認問題から 3=実践問題から。段階だけで最初の分野は変えない。
 */
export const LEVELS = {
  1: { label: '未着手', mode: 1 },
  2: { label: '基礎学習中', mode: 2 },
  3: { label: '応用学習中', mode: 3 },
  4: { label: '過去問演習中', mode: 3 },
};
