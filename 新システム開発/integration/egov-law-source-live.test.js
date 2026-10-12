import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createEgovLawSourceVerifier} from '../src/egov-law-source-verifier.js';

test('live e-Gov date-specific statute retrieval verifies citation', async () => {
  const lawId='405AC0000000088';
  const effectiveDate='2025-04-01';
  const officialUrl='https://laws.e-gov.go.jp/law/405AC0000000088?occasion_date=20250401';
  const sourceText='行政運営における公正の確保と透明性';
  const sourceSha256=createHash('sha256').update(sourceText,'utf8').digest('hex');
  const verify=createEgovLawSourceVerifier({timeoutMs:20000});
  const receipt=await verify({
    lawId,
    lawName:'行政手続法',
    provision:'第一条',
    articleTitle:'目的等',\n    articleElement:'MainProvision-Article_1',
    effectiveDate,
    officialUrl,
    sourceText,
    excerpt:sourceText,
    sourceSha256
  },{
    questionId:'integration:egov:administrative-procedure-act:article-1',
    packetHash:'official-egov-live-date-specific',
    sourceSha256
  });
  assert.equal(receipt.verified,true);
  assert.equal(receipt.officialUrl,officialUrl);
  assert.equal(receipt.effectiveDate,effectiveDate);
  assert.match(receipt.revisionId,/^405AC0000000088_\d{8}_/);
  assert.equal(receipt.sourceSha256,sourceSha256);
});
