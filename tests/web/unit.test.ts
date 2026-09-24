import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, request, safeLink, readAnswer, RequestError, takeAuthCallback } from '../../apps/web/src/api.ts';
import { Schemas } from '../../packages/contracts/src/index.ts';
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
  assert.throws(()=>readAnswer({id:'11111111-1111-4111-8111-111111111111',institution_id:'11111111-1111-4111-8111-111111111111',conversation_id:'11111111-1111-4111-8111-111111111111',status:'answered',language:'en',claims:[{text:'Synthetic test',evidence_ids:['11111111-1111-4111-8111-111111111111']}],evidence:[],explanation:null,created_at:'2026-09-25T00:00:00Z'}));
});
