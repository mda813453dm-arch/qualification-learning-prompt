/**
 * プロンプトだけで使う方式（pages.js）で扱う資格の台帳。
 * 公式PDFのURLはプログラムが持つ（AIに探させない）。URLは公式サイトで確認済みのものだけを書く。
 */
export const CATALOG = {
  takken: {
    qualificationId: 'q041',
    name: '宅地建物取引士（宅建）',
    officialSite: 'https://www.retio.or.jp/exam/index.html',
    pastExamPage: 'https://www.retio.or.jp/exam/past_ques_ans/other/',
    // 公式の免除制度：登録講習の修了者は問46〜50の5問が免除
    exemption: { label: '登録講習の修了による5問免除（問46〜50）', numbers: [46, 47, 48, 49, 50] },
    sources: [
      { adapter: 'takken', year: 2025, section: 'main', questionUrl: 'https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf', answerUrl: null },
    ],
  },
  surveyor: {
    qualificationId: 'q063',
    name: '測量士補',
    officialSite: 'https://www.gsi.go.jp/LAW/SHIKEN/SHIKEN-top.htm',
    pastExamPage: 'https://www.gsi.go.jp/LAW/SHIKEN/past.html',
    exemption: null,
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
