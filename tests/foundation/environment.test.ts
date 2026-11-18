import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseTarget, parseEnvironment } from '../../packages/contracts/src/env.js';

test('blank configuration safely disables providers and protected capabilities', () => {
  const result = parseEnvironment({ OPENAI_API_KEY: '', TYPESAFE_API_KEY: '' });
  assert.equal(result.env.AI_MODE, 'disabled');
  assert.equal(result.env.AI_LIVE_CALLS_ENABLED, false);
  assert.equal(result.configured.providers, false);
  assert.equal(result.configured.core, false);
});
test('OpenAI is default; explicit Jev needs its own configuration, without fallback', () => {
  const input = {
    AI_MODE: 'live',
    AI_LIVE_CALLS_ENABLED: 'true',
    OPENAI_API_KEY: 'fixture',
    OPENAI_CHAT_MODEL: 'fixture-model',
  };
  assert.equal(parseEnvironment(input).env.EVIDENCE_PROVIDER, 'openai');
  assert.equal(parseEnvironment(input).configured.providers, true);
  assert.equal(
    parseEnvironment({ ...input, EVIDENCE_PROVIDER: 'jev' }).configured.providers,
    false,
  );
  assert.equal(
    parseEnvironment({ ...input, EVIDENCE_PROVIDER: 'jev', TYPESAFE_API_KEY: 'fixture' }).configured
      .providers,
    true,
  );
  assert.throws(() => parseEnvironment({ ...input, EVIDENCE_PROVIDER: 'fallback' }));
});
test('service-specific validation does not require sharing private credentials', () => {
  const internal = 'synthetic-internal-secret-at-least-32-characters';
  assert.equal(
    parseEnvironment(
      {
        DATABASE_URL: 'postgresql://noti_school_api:fixture@127.0.0.1/noti_school',
        INTERNAL_AUTH_SECRET: internal,
      },
      'api',
    ).configured.core,
    true,
  );
  assert.equal(
    parseEnvironment(
      {
        AUTH_DATABASE_URL: 'postgresql://noti_school_auth:fixture@127.0.0.1/noti_school',
        BETTER_AUTH_SECRET: internal,
        INTERNAL_AUTH_SECRET: internal,
      },
      'auth',
    ).configured.core,
    true,
  );
});
test('reject unsafe production, proxy, mode and credential settings', () => {
  for (const input of [
    { NODE_ENV: 'production', APP_ORIGIN: 'http://noti.school' },
    { NODE_ENV: 'production', APP_ORIGIN: 'https://noti.school', AI_MODE: 'mock' },
    { AI_MODE: 'live' },
    { AI_LIVE_CALLS_ENABLED: 'yes' },
    { AI_MONTHLY_BUDGET_USD: '51' },
    { API_BIND_ADDRESS: '0.0.0.0:3810' },
    { AUTH_INTERNAL_URL: 'http://evil.invalid' },
    { BETTER_AUTH_SECRET: 'short' },
    { VITE_OPENAI_API_KEY: 'fixture' },
    { APP_ORIGIN: 'https://noti.school/path' },
  ])
    assert.throws(() => parseEnvironment(input));
});
test('migration target guard rejects shared DBs, remote hosts, role confusion and override options', () => {
  const ok = 'postgresql://noti_school_migrator:fixture@127.0.0.1/noti_school_test_foundation';
  assert.equal(databaseTarget(ok, 'migrator', true).database, 'noti_school_test_foundation');
  for (const raw of [
    ok.replace('noti_school_test_foundation', 'postgres'),
    ok.replace('127.0.0.1', 'db.example'),
    ok.replace('noti_school_migrator', 'postgres'),
    ok + '?options=-csearch_path=public',
    ok.replace('noti_school_test_foundation', 'noti_school'),
  ])
    assert.throws(() => databaseTarget(raw, 'migrator', true));
});
test('web discovery settings: pinned Jev model, bounded limits and thresholds, server-side key', () => {
  const live = {
    AI_MODE: 'live',
    AI_LIVE_CALLS_ENABLED: 'true',
    OPENAI_API_KEY: 'fixture',
    OPENAI_CHAT_MODEL: 'fixture-model',
  };
  const defaults = parseEnvironment({}).env;
  assert.equal(defaults.JEV_MODEL, 'jev-1.14.0');
  assert.equal(defaults.TINYFISH_DAILY_SEARCH_LIMIT, 1000);
  assert.equal(defaults.TINYFISH_DAILY_FETCH_LIMIT, 300);
  assert.equal(defaults.WEB_EVIDENCE_MIN_CONFIDENCE, 0.6);
  assert.equal(defaults.GRAPH_AUTO_APPROVE, 0.9);
  assert.equal(parseEnvironment({ JEV_MODEL: 'jev-1.13.0' }).env.JEV_MODEL, 'jev-1.13.0');
  assert.equal(parseEnvironment(live).configured.discovery, false);
  assert.equal(parseEnvironment({ ...live, TINYFISH_API_KEY: 'fixture' }).configured.discovery, false);
  assert.equal(
    parseEnvironment({ ...live, TINYFISH_API_KEY: 'fixture', TYPESAFE_API_KEY: 'fixture' }).configured.discovery,
    true,
  );
  for (const input of [
    { JEV_MODEL: 'jev-latest' },
    { JEV_MODEL: 'jev-1.14' },
    { TINYFISH_DAILY_SEARCH_LIMIT: '0' },
    { TINYFISH_DAILY_SEARCH_LIMIT: '12001' },
    { TINYFISH_DAILY_FETCH_LIMIT: '1001' },
    { WEB_EVIDENCE_MIN_CONFIDENCE: '1.5' },
    { GRAPH_AUTO_APPROVE: '-0.1' },
    { VITE_TINYFISH_API_KEY: 'fixture' },
  ])
    assert.throws(() => parseEnvironment(input), JSON.stringify(input));
});
