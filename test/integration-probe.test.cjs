'use strict';
/** "Test connection" must call a real endpoint: Jira's bare /rest/api/3 is a 404. */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { probeSpecFor, hasPlaceholderHost, resolveUpstreamUrl, INTEGRATION_TEMPLATES } = loadTs('src/shared/integrations.ts');

const url = (base) => resolveUpstreamUrl(base, probeSpecFor(base).path).toString();

test('Jira probes /myself, Confluence /spaces', () => {
  assert.equal(url('https://acme.atlassian.net/rest/api/3'), 'https://acme.atlassian.net/rest/api/3/myself');
  assert.equal(url('https://acme.atlassian.net/wiki/api/v2'), 'https://acme.atlassian.net/wiki/api/v2/spaces?limit=1');
});

test('known services get an authenticated read; Notion sends its version header; Linear POSTs', () => {
  assert.equal(url('https://api.github.com'), 'https://api.github.com/user');
  assert.equal(url('https://api.stripe.com/v1'), 'https://api.stripe.com/v1/balance');
  assert.equal(url('https://sentry.io/api/0'), 'https://sentry.io/api/0/organizations/');
  assert.equal(probeSpecFor('https://api.notion.com/v1').headers['notion-version'], '2022-06-28');
  const linear = probeSpecFor('https://api.linear.app/graphql');
  assert.equal(linear.method, 'POST');
  assert.match(linear.body, /viewer/);
});

test('anything else is probed at its base, as before', () => {
  assert.deepEqual(probeSpecFor('https://example.com/api'), { method: 'GET', path: '' });
  assert.deepEqual(probeSpecFor('not a url'), { method: 'GET', path: '' });
});

test('the untouched template host is flagged', () => {
  assert.equal(hasPlaceholderHost('https://your-domain.atlassian.net/rest/api/3'), true);
  assert.equal(hasPlaceholderHost('https://acme.atlassian.net/rest/api/3'), false);
  assert.ok(INTEGRATION_TEMPLATES.filter((t) => /your-domain/.test(t.baseUrl)).every((t) => hasPlaceholderHost(t.baseUrl)));
});
