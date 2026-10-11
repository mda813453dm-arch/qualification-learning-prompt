import { retrieveAndVerify } from "./legacy-retrieval-engine.js";
import { createOfficialRetrievalPipeline } from "./official-retrieval-pipeline.js";
/**
 * 実際の旧検証関数を呼ぶ結合口。
 * adapters はサーバー側で設定したPDF取得・解析アダプターに限る。
 */
export function createLegacyVerifiedPipeline(adapters) {
  return createOfficialRetrievalPipeline({ retrieveAndVerify, adapters });
}
