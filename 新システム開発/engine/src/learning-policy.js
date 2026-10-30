/**
 * 学習方式の保守的な自動分類（公式の問題本文・正答には一切触れない）。
 * 紛らわしい論点の対応付けは検証済みの明示的なIDだけを使用する。
 * 不確かな設問は unclassified にして既存の通常出題へ戻す。
 */
const CALCULATION = /(?:計算(?:し|して|する|方法|手順)|算出(?:し|する)|求め(?:よ|なさい|る|た)|座標値|方位角を|方向角を|面積を求め)/;
const JUDGEMENT = /(?:適切(?:な|で)|正しい(?:もの|記述)|誤っている(?:もの|記述)|妥当(?:な|で)|判断(?:し|する)|該当する(?:もの|場合))/;
const RECALL = /(?:条文番号|第[0-9０-９]+条(?:第[0-9０-９]+項)?(?:に定め|の規定)|名称は|定義は|何という|何と呼|用語は)/;
const VALID_METHODS = new Set(['recall','guided','contrast']);

/**
 * 検証済みの対比ペアと、設問本文に明記された制度名だけを照合する。
 * 両方の語がある設問や制度名が曖昧な設問は結び付けない。
 * 対象資格の公式問題番号に結び、他資格への横断的な推測を防ぐ。
 */
const CURATED_PAIRS = [
  { prefix:'q041:', first:'q041:article35', second:'q041:article37',
    firstRe:/(?:宅地建物取引業法|宅建業法)\s*第?35条/,
    secondRe:/(?:宅地建物取引業法|宅建業法)\s*第?37条/ },
  { prefix:'land_surveyor:', first:'land_surveyor:display_registration', second:'land_surveyor:rights_registration',
    firstRe:/表示に関する登記/, secondRe:/権利に関する登記/ },
];

function curatedContrast(packet, stem) {
  if (packet?.stemMode === 'official_image' || typeof packet?.questionId !== 'string') return null;
  const pair = CURATED_PAIRS.find(p => packet.questionId.startsWith(p.prefix));
  if (!pair) return null;
  const left = pair.firstRe.test(stem), right = pair.secondRe.test(stem);
  if (left === right) return null;
  return {
    method:'contrast', confidence:'curated_rule',
    verifiedTopicId:left ? pair.first : pair.second,
    contrastTopicIds:[left ? pair.second : pair.first],
  };
}

function verifiedLink(packet) {
  const t = packet?.learningTags;
  if (!t || t.verified !== true || typeof packet.topicId !== 'string' || !packet.topicId.trim()) return null;
  if (!Array.isArray(t.contrastTopicIds) || t.contrastTopicIds.length === 0 || t.contrastTopicIds.length > 8) return null;
  const ids = t.contrastTopicIds.filter(x => typeof x === 'string' && /^[a-zA-Z0-9:_-]{2,100}$/.test(x) && x !== packet.topicId);
  return ids.length === t.contrastTopicIds.length ? ids : null;
}

export function learningPolicy(packet) {
  const explicit = packet?.learningTags;
  if (explicit?.verified === true && VALID_METHODS.has(explicit.method)) {
    const contrasts = verifiedLink(packet) ?? [];
    // 関連IDが不正確なときは自動で結び付けない
    return { method: explicit.method === 'contrast' && !contrasts.length ? 'unclassified' : explicit.method,
      confidence: 'verified', contrastTopicIds: contrasts };
  }
  const stem = typeof packet?.stem === 'string' ? packet.stem.normalize('NFKC') : '';
  if (!stem || packet.stemMode === 'official_image') return { method: 'unclassified', confidence: 'unknown', contrastTopicIds: [] };
  const curated = curatedContrast(packet, stem);
  if (curated) return curated;
  if (CALCULATION.test(stem)) return { method: 'guided', confidence: 'rule', contrastTopicIds: [] };
  if (RECALL.test(stem) && !JUDGEMENT.test(stem)) return { method: 'recall', confidence: 'rule', contrastTopicIds: [] };
  if (JUDGEMENT.test(stem)) return { method: 'guided', confidence: 'rule', contrastTopicIds: [] };
  return { method: 'unclassified', confidence: 'unknown', contrastTopicIds: [] };
}

/** 検証済み相互参照がある期限到来済み問題だけを交互化する。期限と出題資格は呼出側で検証済み。 */
export function orderDueByContrast(due, byUnit, lastTopicId) {
  if (!lastTopicId || !Array.isArray(due) || due.length < 2) return due;
  const topicOf = p => learningPolicy(p).verifiedTopicId ?? p.topicId;
  const trusted = p => ['verified','curated_rule'].includes(learningPolicy(p).confidence);
  const last = [...byUnit.values()].flat().find(x => topicOf(x.packet) === lastTopicId && trusted(x.packet));
  if (!last) return due;
  const lastLinks = learningPolicy(last.packet).contrastTopicIds;
  if (!lastLinks.length) return due;
  const index = due.findIndex(r => (byUnit.get(r.unitId) ?? []).some(x => {
    const p = x.packet;
    return trusted(p) && lastLinks.includes(topicOf(p)) && learningPolicy(p).contrastTopicIds.includes(lastTopicId);
  }));
  return index <= 0 ? due : [due[index], ...due.slice(0,index), ...due.slice(index+1)];
}

/** 正答履歴がない概念・計算だけは例題を優先する。既習なら想起練習へ。 */
export function learningPhase(policy, historyEntry, kind) {
  if (kind === 'review') return 'closed_book_recall';
  if (policy.method === 'guided' && !['confident_correct','guess_correct','correct'].includes(historyEntry?.result)) return 'worked_example_first';
  return 'closed_book_recall';
}
