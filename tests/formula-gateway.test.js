import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { rewriteFormulaLinks } from '../src/index.js';

function request(path) {
  return new Request(`https://123lh.668870.cc${path}`);
}

test('thumbnail comes through the formula service binding', async () => {
  let called = 0;
  const env = { FORMULA_SITE: { async fetch(upstream) {
    called += 1;
    assert.equal(new URL(upstream.url).pathname, '/api/formula-recommendations/thumbnail');
    return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
  } } };
  const response = await worker.fetch(request('/api/public/formula-thumbnail?lotteryType=5&board=zodiac&category=1'), env, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.equal(await response.text(), '<svg/>');
  assert.equal(called, 1);
  assert.equal((await worker.fetch(request('/api/public/formula-thumbnail?board=invalid'), env, {})).status, 400);
  assert.equal((await worker.fetch(request('/api/public/formula-thumbnail?board=zodiac'), {}, {})).status, 503);
});

test('card click gets a short-lived ticket via the named binding', async () => {
  let called = 0;
  const env = { FORMULA_SITE: { async issueEntryTicket() { called += 1; return 'a'.repeat(64); } } };
  const response = await worker.fetch(request('/api/public/formula-open'), env, {});
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get('location')).pathname, '/open');
  assert.equal(new URL(response.headers.get('location')).searchParams.get('t'), 'a'.repeat(64));
  assert.equal(called, 1);
});

test('homepage image and card links no longer point to the public formula API', () => {
  const html = '<a href="https://txgs888.q3665.com/"><img src="https://txgs888.q3665.com/api/formula-recommendations/thumbnail?board=zodiac"></a>';
  const rewritten = rewriteFormulaLinks(html);
  assert.match(rewritten, /href="\/api\/public\/formula-open"/);
  assert.match(rewritten, /src="\/api\/public\/formula-thumbnail\?/);
});
