import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, request, safeLink, readAnswer, RequestError, takeAuthCallback } from '../../apps/web/src/api.ts';
import { Schemas } from '../../packages/contracts/src/index.ts';
import { confidenceLevel, percent } from '../../apps/web/src/ui/confidence-level.ts';
import { allStrings, fill, t } from '../../apps/web/src/ui/i18n.ts';
import { asciiHost, parseDomains } from '../../apps/web/src/ui/domains.ts';
import { passkeySupported } from '../../apps/web/src/passkey.ts';
test('public endpoint registry excludes internals and encodes IDs',()=>{
  assert.throws(()=>endpoint('/internal/session'));
  assert.throws(()=>endpoint('/internal/accounts/delete'));
  assert.throws(()=>endpoint('/internal/capabilities'));
  assert.throws(()=>endpoint('/invented'));
  assert.equal(endpoint('/api/v1/institutions/{institution_id}/sources',{institution_id:'a/b'}),'/api/v1/institutions/a%2Fb/sources');
});
test('hash and query callbacks are consumed without retaining tokens or raw provider errors',()=>{
  for (const url of ['https://noti.school/?token=synthetic#/auth', 'https://noti.school/#/auth?token=synthetic']) {
    const result=takeAuthCallback(url);assert.equal(result.token,'synthetic');assert.equal(result.clean,'/#/auth');
  }
  const result=takeAuthCallback('https://noti.school/#/auth/error?delete_token=synthetic&error=private&error_description=private');
  assert.equal(result.deletion,'synthetic');assert.equal(result.error,true);assert.equal(result.clean,'/#/auth/error');
});
test('safe links reject executable, relative and insecure schemes',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,test','http://example.com','//evil.test','/foo'])assert.equal(safeLink(value),undefined);
  assert.equal(safeLink('https://example.com/a'),'https://example.com/a');
});
test('custom mutation uses credentials and CSRF; rejects malformed success',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_input,init)=>{calls++;assert.equal(init?.credentials,'same-origin');assert.equal(new Headers(init?.headers).get('X-Noti-CSRF'),'1');return new Response(JSON.stringify({wrong:true}),{status:200});};
  try{await assert.rejects(request('/api/v1/answers',Schemas.Answer,{method:'POST',body:'{}'}),RequestError);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('does not echo unsafe server errors or automatically retry',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'internal_error',message:'secret traceback',request_id:'11111111-1111-4111-8111-111111111111',retryable:true}}),{status:500});};
  try{await assert.rejects(request('/api/v1/answers',Schemas.Answer),e=>e instanceof Error&&!e.message.includes('secret'));assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('rejects structurally valid answer with missing citation',()=>{
  assert.throws(()=>readAnswer({id:'11111111-1111-4111-8111-111111111111',institution_id:'11111111-1111-4111-8111-111111111111',conversation_id:'11111111-1111-4111-8111-111111111111',status:'answered',language:'en',claims:[{text:'Synthetic test',evidence_ids:['11111111-1111-4111-8111-111111111111'],confidence:null}],evidence:[],explanation:null,confidence:null,created_at:'2026-09-25T00:00:00Z'}),/Invalid evidence references/);
});
test('confidence words follow the owner thresholds and the number never contradicts the word',()=>{
  assert.deepEqual([1,0.8,0.7999,0.6,0.5999,0].map(confidenceLevel),['high','high','medium','medium','low','low']);
  assert.deepEqual([1,0.8,0.7999,0.6,0.5999,0.57,0].map(percent),['100%','80%','79%','60%','59%','57%','0%']);
});
test('every interface string exists in English and Vietnamese without em or en dashes',()=>{
  for(const {key,en,vi} of allStrings()){
    assert.ok(en.trim()&&vi.trim(),key);
    assert.doesNotMatch(en+vi,/[–—]/,key);
  }
  assert.equal(t('en','searchingWeb'),'Searching approved documents and the web…');
  assert.notEqual(t('vi','searchingWeb'),t('en','searchingWeb'));
  assert.equal(t('en','searchingWebOnly'),'Searching the web…');
  assert.equal(t('vi','searchingWebOnly'),'Đang tìm trên web…');
});
test('typed domains become ASCII hosts; Unicode names are converted and non-hosts are refused',()=>{
  assert.equal(asciiHost('Library.Example.edu'),'library.example.edu');
  assert.equal(asciiHost('trường.example'),'xn--trng-rib8295b.example');
  assert.equal(asciiHost('TRƯỜNG.example'),'xn--trng-rib8295b.example');
  assert.equal(asciiHost('xn--trng-rib8295b.example'),'xn--trng-rib8295b.example');
  // The hint shown to administrators names exactly the form that is saved.
  for(const lang of ['en','vi'] as const)assert.ok(t(lang,'domainsHint').includes(`trường.example`)&&t(lang,'domainsHint').includes(asciiHost('trường.example')!));
  for(const value of ['','https://example.edu','example.edu/path','example.edu:8443','user@example.edu','192.168.1.1','0x7f.1','[::1]','localhost','*.example.edu','a_b.example','example.edu.','ex%61mple.edu','exa mple.edu','example.edu?x=1','example.edu#top'])assert.equal(asciiHost(value),undefined,value);
  assert.deepEqual(parseDomains('example.edu\nTrường.example, example.edu'),['example.edu','xn--trng-rib8295b.example']);
  assert.equal(parseDomains('example.edu\nhttps://example.edu/path'),undefined);
  assert.deepEqual(parseDomains('  '),[]);
});
test('where answers come from is stated in both languages without promising approved-only answers',()=>{
  const en=t('en','faqEvidenceAnswer'),vi=t('vi','faqEvidenceAnswer');
  assert.match(en,/reviewed documents first, then pages from the web/);
  assert.match(en,/where each part came from and how sure it is/);
  assert.match(en,/Web pages are labelled and never shown as approved/);
  assert.match(vi,/tài liệu đã duyệt của trường bạn trước, sau đó đến các trang trên web/);
  assert.match(vi,/không bao giờ hiển thị như tài liệu đã duyệt/);
  for(const {key,en:english,vi:vietnamese} of allStrings())if(/^(story|faq)/.test(key))assert.doesNotMatch(english+vietnamese,/only approved|nothing else|chỉ .*tài liệu đã duyệt/i,key);
  assert.equal(t('en','originSaved'),'Saved by you');
  assert.notEqual(t('en','originSaved'),t('en','originApproved'));
});
test('the web notice names the school and never calls web pages approved',()=>{
  assert.equal(fill(t('en','webNotice'),{school:'Synthetic School'}),'Includes pages found on the web. They have not been reviewed by Synthetic School staff.');
  assert.match(fill(t('vi','webNotice'),{school:'Synthetic School'}),/Synthetic School/);
  assert.equal(fill('{missing} stays empty',{}),' stays empty');
});
test('an invitation link is consumed into memory and scrubbed from the address',()=>{
  for (const url of ['https://noti.school/?invitation=synthetic#/auth','https://noti.school/#/auth?invitation=synthetic']) {
    const result=takeAuthCallback(url);assert.equal(result.invitation,'synthetic');assert.equal(result.clean,'/#/auth');assert.equal(result.token,'');assert.equal(result.deletion,'');
  }
  assert.equal(takeAuthCallback('https://noti.school/#/auth?invitation='+'a'.repeat(257)).invitation,'');
  assert.equal(takeAuthCallback('https://noti.school/#/auth').invitation,'');
});
test('account copy is bilingual and says plainly what needs email',()=>{
  assert.equal(t('en','authResetNeedsEmail'),'Password reset is not available yet.');
  assert.equal(t('vi','authResetNeedsEmail'),'Hiện chưa thể đặt lại mật khẩu.');
  // The invitation screen's wording, as the owner gave it.
  assert.equal(t('en','authModeAccept'),'Accept your invitation');
  assert.equal(t('en','authIntroCreateInvited'),'Create a password for the email address your invitation was sent to.');
  assert.equal(t('en','authInvitationAttached'),'Invitation attached');
  assert.equal(t('en','authInvitationOther'),'Use a different invitation');
  assert.equal(t('en','authEmailHint'),'Use the address the invitation was sent to.');
  assert.equal(t('en','authDeletionNeedsEmail'),'Account deletion needs email, which is not set up yet.');
  assert.equal(t('en','authPasskeySignIn'),'Sign in with a passkey');
  const account=allStrings().filter(({key})=>key.startsWith('auth'));
  assert.ok(account.length>=100);
  // Only names shared by both languages may read the same.
  const shared=new Set(['authEmail','authPasskeyUnnamed']);
  for(const {key,en,vi} of account){
    assert.ok(en.trim()&&vi.trim(),key);
    assert.doesNotMatch(en+vi,/[–—]/,key);
    if(!shared.has(key))assert.notEqual(en,vi,key);
  }
  // A cancelled passkey prompt is never worded as a failure.
  for(const key of ['authPasskeyAddCancelled','authPasskeySignInCancelled'] as const)assert.doesNotMatch(t('en',key),/error|fail|wrong|denied/i,key);
});
test('passkey support is never assumed outside a browser',()=>{
  assert.equal(passkeySupported(),false);
});
