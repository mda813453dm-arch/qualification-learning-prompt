import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmVisualDelivery as confirm} from '../src/client-visual-confirmation.js';
const sha='a'.repeat(64);
test('利用者の表示未確認なら拒否',()=>assert.equal(confirm({questionNumber:7,sourceImageSha256:sha,renderedImageSha256:sha}).reason,'USER_VISIBLE_IMAGE_NOT_CONFIRMED'));
test('元画像ハッシュ未確認なら拒否',()=>assert.equal(confirm({questionNumber:7,renderedImageSha256:sha,userConfirmedVisible:true}).reason,'SOURCE_IMAGE_NOT_VERIFIED'));
test('表示画像が異なるなら拒否',()=>assert.equal(confirm({questionNumber:7,sourceImageSha256:sha,renderedImageSha256:'b'.repeat(64),userConfirmedVisible:true}).reason,'RENDERED_IMAGE_UNVERIFIED'));
test('表示確認だけでは出題承認しない',()=>{const r=confirm({questionNumber:7,sourceImageSha256:sha,renderedImageSha256:sha,userConfirmedVisible:true});assert.equal(r.status,'display-confirmed');assert.equal(r.publishable,false)});
