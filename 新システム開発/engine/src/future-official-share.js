/**
 * 将来の公式過去問共有候補（現時点で「保存済み」の証明ではない）。
 * 資格台帳に既にある既知の名称・識別子とだけ結び付ける。
 *
 * 公式PDFの所持、URLの登録、過去問の解析可能性、そして本番での共有保存は別状態。
 * 実際の原本を受領・同一性検査しないままSHA、問数、正答、年度を補完しない。
 */
import { CATALOG } from './catalog.js';

export const FUTURE_OFFICIAL_SHARED_KEYS = Object.freeze([
  'takken', 'surveyor', 'itpass', 'chintai', 'mankan', 'gyosei',
]);

const NEEDS = Object.freeze({
  takken: '年度ごとの公式問題と正答。同一PDFに両方含まれる場合は各ページ範囲まで確認。5問免除を区別。',
  surveyor: '年度ごとの公式問題と正答。図表・方位角・数値・多ページ図を原本と照合。',
  itpass: 'CBTの公開問題PDFと公式正答。公開問題の実施年度・版・100問の対応を確認。',
  chintai: '著作物使用許諾は運営者未取得。全ユーザー共有不可。許諾取得者本人が年度別に添付する個人用取込のみ準備。共有は別途権利者許諾の後に再検討。5問免除の扱いを確認。',
  mankan: '年度ごとの公式問題と正答。問題番号・四肢択一・図表・適用年度を確認。',
  gyosei: '年度ごとの公式問題と公式正答資料（PDFまたは公式HTML）。五肢択一・多肢選択・記述式を区別し、自動採点対象を検証。',
});

/** 誰に見せても「共有済み」と誤認させない将来受入候補の情報。 */
export function futureOfficialShareTargets() {
  return FUTURE_OFFICIAL_SHARED_KEYS.map((key) => {
    const cat = CATALOG[key];
    if (!cat || !cat.qualificationId || !cat.name || !Array.isArray(cat.sources))
      throw new Error('FUTURE_SHARE_CATALOG_MISMATCH: ' + key);
    return {
      qualificationKey: key,
      qualificationId: cat.qualificationId,
      qualificationName: cat.name,
      officialExamPage: cat.pastExamPage,
      sharedRegistrationStatus: 'not_registered',
      uploadedYears: [],
      savedSections: [],
      sharedQuestionCount: 0,
      requirements: NEEDS[key],
    };
  });
}

export function futureOfficialShareTarget(keyOrId) {
  return futureOfficialShareTargets().find(
    (item) => item.qualificationKey === keyOrId || item.qualificationId === keyOrId,
  ) ?? null;
}
