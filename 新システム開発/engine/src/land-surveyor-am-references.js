/**
 * 2013–2019 午前の部: 21 independently opened articles from 中山祐介講師.
 * The objective answer vectors were also checked against the published
 * multiple-choice answer PDFs; the descriptive values are the lecturer's
 * worked *examples*, not Ministry-published model answers.
 *
 * Only factual final answers are transcribed, never copyrighted explanations.
 * Drawing problems have no model drawing in the linked articles.
 */
const BLOG = 'https://nakayama-yusuke.com/nakayama-am_kaisetu_';
const SOURCE_INDEX = 'https://nakayama-yusuke.com/nakayama-am_kaisetu_matome/';
const a = (number, answer, tokens = []) => ({ number, answer, tokens });

export const LAND_SURVEYOR_AM_REFERENCES = Object.freeze({
  2013: {
    slug: 'h25', choices: [3,1,5,5,3,1,4,1,2,2],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_h25_a.pdf',
    answers: [
      a(1,'Q点 X=110.48m、Y=98.42m',['110.48','98.42']),
      a(2,'土地面積236.92㎡',['236.92']),
      a(3,'T1→Aの方向角317°、水平距離6.48m',['317°','6.48']),
      a(4,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
  2014: {
    slug: 'h26', choices: [2,1,3,3,2,2,1,3,3,3],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_h26_a.pdf',
    answers: [
      a(1,'DF=2.54m、EF=2.67m',['2.54','2.67']),
      a(2,'H→Iの方向角10°',['10°']),
      a(3,'B点 X=20.20m、Y=20.40m',['20.20','20.40']),
      a(4,'土地面積302.0832㎡',['302.0832']),
      a(5,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
  2015: {
    slug: 'h27', choices: [4,4,4,4,3,2,1,3,1,3],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_h27_a.pdf',
    answers: [
      a(1,'T2→Aの水平角49°、水平距離5.66m',['49°','5.66']),
      a(2,'F点 X=112.38m、Y=80.32m',['112.38','80.32']),
      a(3,'土地面積400.47㎡',['400.47']),
      a(4,'P点 X=117.44m、Y=90.26m',['117.44','90.26']),
      a(5,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
  2016: {
    slug: 'h28', choices: [4,3,3,4,2,5,2,5,1,1],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_h28_a.pdf',
    answers: [
      a(1,'T1→Eの水平角119°、水平距離6.48m',['119°','6.48']),
      a(2,'∠CBD=60°',['60°']),
      a(3,'D点 X=38.45m、Y=23.43m',['38.45','23.43']),
      a(4,'土地面積209.39㎡',['209.39']),
      a(5,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
  2017: {
    slug: 'h29', choices: [2,4,4,4,2,3,5,4,5,4],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_h29_a.pdf',
    answers: [
      a(1,'調整後T3 X=510.88m、Y=491.82m',['510.88','491.82']),
      a(2,'E点 X=515.73m、Y=494.23m',['515.73','494.23']),
      a(3,'F点 X=507.23m、Y=479.51m',['507.23','479.51']),
      a(4,'土地面積33.85㎡',['33.85']),
      a(5,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
  2018: {
    slug: 'h30', choices: [3,4,2,2,4,4,4,5,3,2],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_h30_a.pdf',
    note: 'ブログでは3番目の小問の見出しが再び「小問2」と印字されている。設問順に小問3として整理（原本要照合）。',
    answers: [
      a(1,'F点 X=35.38m、Y=61.51m',['35.38','61.51']),
      a(2,'D点 X=54.07m、Y=55.03m',['54.07','55.03']),
      a(3,'∠BCD=90°00′00″',['90°']),
      a(4,'土地面積330.34㎡',['330.34']),
      a(5,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
  2019: {
    slug: 'r1', choices: [2,3,4,5,5,5,1,2,1,4],
    choiceKey: 'https://izuki.net/wp-content/uploads/c_r1_a.pdf',
    answers: [
      a(1,'T2→Aの水平角239°30′28.85″、水平距離8.10m',['239°30\'28.85','8.10']),
      a(2,'F点 X=24.01m、Y=48.74m',['24.01','48.74']),
      a(3,'C点 X=27.05m、Y=65.87m',['27.05','65.87']),
      a(4,'土地面積165.37㎡',['165.37']),
      a(5,'作図（ブログでは図面解答を省略。原本で確認）'),
    ],
  },
});

/** Answers are source-backed but never sent before a descriptive reveal. */
export function landSurveyorMorningReference(year) {
  const row = LAND_SURVEYOR_AM_REFERENCES[Number(year)];
  if (!row) return null;
  return {
    year: Number(year), section: '午前の部', number: 11,
    source: '中山祐介講師「調査士＜午前の部＞解説ミニ講座」（記述式は公式模範解答ではない）',
    sourceIndex: SOURCE_INDEX,
    sourceUrl: `${BLOG}${row.slug}_11/`,
    choices: row.choices,
    choicesSources: [`${BLOG}${row.slug}_1to5/`,`${BLOG}${row.slug}_6to10/`],
    choicesAnswerPdf: row.choiceKey,
    choicesVerification: '講座記事の10問全解答と当該年度の公表正答PDFの午前列を照合済み',
    answers: row.answers,
    ...(row.note ? { note: row.note } : {}),
    roundingNote: '計算途中の丸め・図面作成は当該年度の問題PDFと照合してください。作図の参考図は記事にありません。',
  };
}
