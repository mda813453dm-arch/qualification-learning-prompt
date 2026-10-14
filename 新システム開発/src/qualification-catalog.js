import { QUALIFICATION_CATALOG_CHUNK_01 } from "./qualification-catalog/chunk-01.js";
import { QUALIFICATION_CATALOG_CHUNK_02 } from "./qualification-catalog/chunk-02.js";
import { QUALIFICATION_CATALOG_CHUNK_03 } from "./qualification-catalog/chunk-03.js";
import { QUALIFICATION_CATALOG_CHUNK_04 } from "./qualification-catalog/chunk-04.js";
import { QUALIFICATION_CATALOG_CHUNK_05 } from "./qualification-catalog/chunk-05.js";
import { QUALIFICATION_CATALOG_CHUNK_06 } from "./qualification-catalog/chunk-06.js";
import { QUALIFICATION_CATALOG_CHUNK_07 } from "./qualification-catalog/chunk-07.js";

export const QUALIFICATION_CATALOG = Object.freeze([
  ...QUALIFICATION_CATALOG_CHUNK_01,
  ...QUALIFICATION_CATALOG_CHUNK_02,
  ...QUALIFICATION_CATALOG_CHUNK_03,
  ...QUALIFICATION_CATALOG_CHUNK_04,
  ...QUALIFICATION_CATALOG_CHUNK_05,
  ...QUALIFICATION_CATALOG_CHUNK_06,
  ...QUALIFICATION_CATALOG_CHUNK_07
].map(x => Object.freeze({
  ...x,
  aliases: Object.freeze([...(x.aliases ?? [])]),
  exemption: Object.freeze({...x.exemption, evidence: Object.freeze([...(x.exemption?.evidence ?? [])])})
})));

if (QUALIFICATION_CATALOG.length !== 103) {
  throw new Error(`QUALIFICATION_CATALOG_COUNT_MISMATCH:${QUALIFICATION_CATALOG.length}`);
}
const names = QUALIFICATION_CATALOG.map(x => x.name);
if (new Set(names).size !== 103) throw new Error("QUALIFICATION_CATALOG_DUPLICATE_NAME");

export const QUALIFICATION_CATALOG_BY_NAME = Object.freeze(Object.fromEntries(
  QUALIFICATION_CATALOG.map(x => [x.name, x])
));
export const QUALIFICATION_CATALOG_COUNT = QUALIFICATION_CATALOG.length;
