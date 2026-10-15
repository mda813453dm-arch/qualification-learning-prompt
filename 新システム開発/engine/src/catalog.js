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
};

export const LEVELS = {
  1: { label: 'これから始める', start: 'explain' },
  2: { label: '基礎は学んだ', start: 'practice' },
  3: { label: '過去問を解いている', start: 'practice' },
};
