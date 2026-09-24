import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { AskRequest, Schemas, validateAnswer } from '../../packages/contracts/src/index.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/synthetic-evidence.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../../packages/contracts/schema.json', import.meta.url), 'utf8'));
test('all published schemas compile and endpoint references resolve', () => {
  const ajv = new Ajv2020({ strict: true });
  (addFormats as unknown as (a: Ajv2020) => void)(ajv);
  ajv.addSchema(schema);
  for (const name of Object.keys(Schemas)) assert.ok(ajv.getSchema(`https://noti.school/contracts/v1#/$defs/${name}`));
  const endpoints = JSON.parse(readFileSync(new URL('../../docs/contracts/endpoints.json', import.meta.url), 'utf8')).endpoints;
  const unique = new Set();
  for (const endpoint of endpoints) {
    const key = endpoint.method + endpoint.path;
    assert.ok(!unique.has(key)); unique.add(key);
    for (const name of [endpoint.request, endpoint.response]) if (name && name !== 'binary') assert.ok(name in Schemas, name);
  }
  assert.equal(ajv.validate({ $ref: 'https://noti.school/contracts/v1#/$defs/Answer' }, fixture.answer), true, JSON.stringify(ajv.errors));
});
test('synthetic bilingual fixture passes structural and semantic validation', () => {
  assert.match(fixture.label, /NON-POLICY/);
  assert.deepEqual(fixture.questions.map((q: { language: string }) => q.language), ['en', 'vi']);
  assert.equal(validateAnswer(fixture.answer).status, 'answered');
});
test('answer rejects fabricated, duplicated and foreign-institution references', () => {
  const unknown = structuredClone(fixture.answer); unknown.claims[0].evidence_ids = ['10000000-0000-4000-8000-999999999999'];
  assert.throws(() => validateAnswer(unknown));
  const duplicate = structuredClone(fixture.answer); duplicate.evidence.push(duplicate.evidence[0]); assert.throws(() => validateAnswer(duplicate));
  const foreign = structuredClone(fixture.answer); foreign.evidence[0].institution_id = '10000000-0000-4000-8000-000000000009'; assert.throws(() => validateAnswer(foreign));
});
test('abstention and locators cannot masquerade as supported answers', () => {
  const invalid = structuredClone(fixture.answer); invalid.status = 'abstained'; assert.throws(() => validateAnswer(invalid));
  invalid.claims = []; invalid.explanation = 'No evidence available.'; assert.equal(validateAnswer(invalid).status, 'abstained');
  const locator = structuredClone(fixture.answer); locator.evidence[0].locator.end_char = 0; assert.throws(() => validateAnswer(locator));
  const missing = structuredClone(fixture.answer); missing.evidence[0].locator.page = null; missing.evidence[0].locator.section = null; assert.throws(() => validateAnswer(missing));
  const unsafe = structuredClone(fixture.answer); unsafe.evidence[0].original_url = 'javascript:alert(1)'; assert.throws(() => validateAnswer(unsafe));
});
test('requests reject empty questions, extra authorization fields and unsupported language', () => {
  const valid = { institution_id: fixture.institution_id, question: 'Synthetic question?', language: 'vi' };
  assert.equal(AskRequest.parse(valid).discover, false);
  for (const bad of [{ ...valid, question: '' }, { ...valid, role: 'admin' }, { ...valid, language: 'xx' }]) assert.equal(AskRequest.safeParse(bad).success, false);
});
test('integration extensions preserve v1 defaults and reject authority/shape injection', () => {
  const version={label:'Synthetic',effective_from:null,effective_until:null};
  assert.equal(Schemas.VersionCreate.parse(version).language,'en');
  assert.equal(Schemas.VersionCreate.parse({...version,language:'vi'}).language,'vi');
  assert.equal(Schemas.AccountDelete.safeParse({user_id:'x',role:'admin'}).success,false);
  assert.equal(Schemas.AccountDelete.safeParse({user_id:'x'.repeat(257)}).success,false);
  assert.equal(Schemas.GraphEntityCreate.safeParse({kind:'office',label:'Synthetic',id:fixture.institution_id}).success,false);
  assert.equal(Schemas.GraphEdgeAction.safeParse({status:'candidate'}).success,false);
  assert.equal(Schemas.DiscoveryPage.safeParse({items:[{title:'Synthetic',url:'http://example.invalid',discovered_at:'2026-09-25T00:00:00Z'}],next_cursor:null}).success,false);
  assert.equal(Schemas.ConversationPage.safeParse({items:[{id:fixture.institution_id,institution_id:fixture.institution_id,created_at:'2026-09-25T00:00:00Z',question:'private'}],next_cursor:null}).success,false);
});
