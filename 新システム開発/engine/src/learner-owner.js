/**
 * 学習者の資格別ID対応表。
 * ChatGPTアカウントの認証情報は提供されないため、既存の引継ぎIDを
 * 継続利用できる場合だけ同じ所有者として関連付ける。
 * 別の引継ぎIDを類推・一括統合しない。
 *
 * 既存の学習記録 lrnstate/<learnerId> と
 * 取込みジョブ job/<qualificationId>~<learnerId> を移動・変更しない。
 */
const LID=/^[a-z2-9]{10}$/;
const QID=/^[a-zA-Z0-9_-]{2,100}$/;
const ownerPointer=(id)=>'owner/root/'+id;
const ownerIndex=(root)=>'owner/qualifications/'+root;

/** 同じ引継ぎIDから資格を変更したとき、資格ごとの既存IDを再利用する。 */
export async function selectQualificationLearner(store, { suppliedId=null, qualificationId, createId, savedQualification=null, now=Date.now() }={}) {
  if(!QID.test(String(qualificationId??'')) || typeof createId!=='function') throw Error('OWNER_INPUT_INVALID');
  if(suppliedId!==null && !LID.test(suppliedId)) throw Error('OWNER_ID_INVALID');
  const base=suppliedId??createId();
  if(!LID.test(base)) throw Error('OWNER_ID_INVALID');
  const pointer=suppliedId?await store.get(ownerPointer(base)):null;
  const root=typeof pointer==='string' && LID.test(pointer)?pointer:base;
  const existing=await store.get(ownerIndex(root),'json');
  const byQualification={...(existing?.byQualification??{})};
  // 過去のIDはそのまま保存。すでに別IDに割り当て済みなら上書きしない。
  if(savedQualification && QID.test(savedQualification) && !byQualification[savedQualification])
    byQualification[savedQualification]=base;
  let id=byQualification[qualificationId];
  if(!id) {
    const baseInUse=Object.entries(byQualification).some(([qid,used])=>qid!==qualificationId && used===base);
    id=(!savedQualification || savedQualification===qualificationId) && !baseInUse ? base : createId();
    if(!LID.test(id) || Object.entries(byQualification).some(([qid,used])=>qid!==qualificationId && used===id))
      throw Error('OWNER_ALIAS_COLLISION');
    byQualification[qualificationId]=id;
  }
  if(!LID.test(id)) throw Error('OWNER_ALIAS_INVALID');
  // 対応表を先に永続化する。後続の学習開始に失敗しても既存IDが失われない。
  if(!existing || JSON.stringify(existing.byQualification)!==JSON.stringify(byQualification))
    await store.put(ownerIndex(root),JSON.stringify({
      version:1,root,byQualification,createdAt:existing?.createdAt??now,updatedAt:now,
    }));
  if(!pointer) await store.put(ownerPointer(base),root);
  if(id!==base) await store.put(ownerPointer(id),root);
  return {learnerId:id,root,qualificationId,byQualification};
}

/** 設計上のグループ化可能範囲のみ返す。実アカウントの本人性は証明しない。 */
export async function qualificationOwnerOverview(store,learnerId) {
  if(!LID.test(String(learnerId??''))) return null;
  const root=await store.get(ownerPointer(learnerId))??learnerId;
  const profile=LID.test(root)?await store.get(ownerIndex(root),'json'):null;
  if(!profile || profile.root!==root) return {qualifications:[],linked:false};
  return {
    linked:true,
    qualifications:Object.keys(profile.byQualification??{}).sort(),
  };
}
