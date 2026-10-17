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
    pastExamPage: 'https://www.retio.or.jp/exam/past_ques_ans/other/',
    // 公式の免除制度：登録講習の修了者は問46〜50の5問が免除
    exemption: { label: '登録講習の修了による5問免除（問46〜50）', numbers: [46, 47, 48, 49, 50] },
    // 分野の分け方（parser/qlp_parser/fields.py と同じ。2026-10-15 確定）
    fields: {
      t1: '土地・建物の形質・構造',
      t2: '権利と権利の変動（民法・借地借家法・区分所有法・不動産登記法）',
      t3: '法令上の制限',
      t4: '税',
      t5: '需給と実務（住宅金融支援機構・景品表示法・統計）',
      t6: '価格の評定（地価公示・鑑定評価）',
      t7: '宅地建物取引業法と関係法令',
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
