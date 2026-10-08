import test from 'node:test';
import assert from 'node:assert/strict';
import { getSiteKey, createSuperBack } from '../src/navigation.js';
import { fakeBrowser } from './fake-browser.js';

const options = { timeoutMs: 40, maxSteps: 200 };

test('groups subdomains using public suffix rules, including private hosting', () => {
  const cases = [
    ['https://www.shop.com/cart', 'shop.com'],
    ['http://checkout.shop.com:8080/product', 'shop.com'],
    ['https://news.example.co.uk/story', 'example.co.uk'],
    ['https://alice.github.io/', 'alice.github.io'],
    ['https://bob.github.io/', 'bob.github.io'],
    ['https://a.blogspot.com/', 'a.blogspot.com'],
    ['https://www.bücher.de/', 'xn--bcher-kva.de'],
    ['https://example.com./', 'example.com'],
    ['http://127.0.0.1:8000/', '127.0.0.1'],
    ['http://[::1]:8000/', '[::1]'],
    ['http://localhost:8000/', 'localhost'],
    ['about:newtab', null],
    ['file:///tmp/page.html', null],
    ['not a url', null],
    [undefined, null],
  ];
  for (const [url, expected] of cases) assert.equal(getSiteKey(url), expected, url);
});

test('unknown and local suffixes compare by exact hostname', () => {
  assert.equal(getSiteKey('http://a.office.internal/'), 'a.office.internal');
  assert.equal(getSiteKey('http://b.office.internal/'), 'b.office.internal');
  assert.equal(getSiteKey('http://a.office.local/'), 'a.office.local');
  assert.equal(getSiteKey('http://a.office.localhost/'), 'a.office.localhost');
});

test('lands on the nearest earlier website and keeps the native Forward stack', async () => {
  const browser = fakeBrowser({ 1: [
    'https://older.org/', 'https://google.com/search',
    'https://www.shop.com/', 'https://shop.com/product', 'https://checkout.shop.com/cart',
  ] });
  const result = await createSuperBack(browser, options)(1);
  assert.equal(result.status, 'found');
  assert.equal(result.steps, 3);
  assert.equal((await browser.tabs.get(1)).url, 'https://google.com/search');
  assert.equal(browser.maxPending, 1, 'does not fire overlapping Back requests');
  await browser.tabs.goForward(1);
  assert.equal((await browser.tabs.get(1)).url, 'https://www.shop.com/');
  assert.equal(browser.temporaryListeners, 0);
});

test('duplicate URL entries do not falsely signal history exhaustion', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/', 'https://shop.com/'] });
  const result = await createSuperBack(browser, options)(1);
  assert.equal(result.status, 'found');
  assert.equal(result.steps, 2);
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
});

test('walks through hash and SPA entries without waiting for document loads', async () => {
  const browser = fakeBrowser({ 1: [
    'https://origin.com/',
    { url: 'https://shop.com/product', kind: 'onHistoryStateUpdated' },
    { url: 'https://shop.com/product#details', kind: 'onReferenceFragmentUpdated' },
    'https://shop.com/product#reviews',
  ] });
  assert.equal((await createSuperBack(browser, options)(1)).status, 'found');
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
});

test('skips internal pages and can start on an internal page', async () => {
  const browser = fakeBrowser({
    1: ['https://origin.com/', 'about:blank', 'https://shop.com/'],
    2: ['https://origin.com/', 'about:blank'],
  });
  const run = createSuperBack(browser, options);
  assert.equal((await run(1)).status, 'found');
  assert.equal((await run(2)).status, 'found');
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
});

test('ignores iframe and unrelated-tab completion events', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/'] }, { delay: 10 });
  const running = createSuperBack(browser, options)(1);
  await new Promise((resolve) => setTimeout(resolve, 1));
  browser.webNavigation.onCompleted.emit({ tabId: 1, frameId: 2, url: 'https://iframe.com/' });
  browser.webNavigation.onCommitted.emit({ tabId: 2, frameId: 0, url: 'https://other.com/' });
  assert.equal((await running).status, 'found');
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
});

test('a second activation cancels further steps instead of running twice', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/a', 'https://shop.com/b'] }, { delay: 10 });
  const run = createSuperBack(browser, options);
  const first = run(1);
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await run(1)).status, 'cancelled');
  assert.equal((await first).status, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(browser.requests, 1);
  assert.equal((await browser.tabs.get(1)).url, 'https://shop.com/a');
  assert.equal(browser.temporaryListeners, 0);
});

test('user navigation cancels an active traversal', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/'] }, { stall: true });
  const running = createSuperBack(browser, options)(1);
  await new Promise((resolve) => setTimeout(resolve, 1));
  browser.webNavigation.onCommitted.emit({
    tabId: 1, frameId: 0, url: 'https://chosen.com/', transitionQualifiers: [],
  });
  assert.equal((await running).status, 'cancelled');
  assert.equal(browser.requests, 1);
  assert.equal(browser.temporaryListeners, 0);
});

test('closing a tab cancels and releases all temporary listeners', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/'] }, { stall: true });
  const running = createSuperBack(browser, options)(1);
  await new Promise((resolve) => setTimeout(resolve, 1));
  browser.close(1);
  assert.equal((await running).status, 'cancelled');
  assert.equal(browser.temporaryListeners, 0);
});

test('different tabs can independently traverse their own history', async () => {
  const browser = fakeBrowser({
    1: ['https://origin.com/', 'https://shop.com/'],
    2: ['https://another.org/', 'https://news.com/'],
  });
  const run = createSuperBack(browser, options);
  const results = await Promise.all([run(1), run(2)]);
  assert.deepEqual(results.map((result) => result.status), ['found', 'found']);
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
  assert.equal((await browser.tabs.get(2)).url, 'https://another.org/');
});

test('history exhaustion times out boundedly, without adding entries', async () => {
  const browser = fakeBrowser({ 1: ['https://shop.com/a', 'https://shop.com/b'] });
  const result = await createSuperBack(browser, options)(1);
  assert.equal(result.status, 'timeout');
  assert.equal(result.steps, 1);
  assert.equal((await browser.tabs.get(1)).url, 'https://shop.com/a');
  assert.equal(browser.temporaryListeners, 0);
});

test('API errors are reported and a future activation is still possible', async () => {
  const browser = fakeBrowser({ 1: ['https://shop.com/'] }, { fail: true });
  const run = createSuperBack(browser, options);
  assert.equal((await run(1)).status, 'error');
  assert.equal((await run(1)).status, 'error');
  assert.equal(browser.requests, 2);
  assert.equal(browser.temporaryListeners, 0);
});

test('navigation errors stop before another Back request', async () => {
  const browser = fakeBrowser({ 1: ['https://shop.com/'] }, { stall: true });
  const running = createSuperBack(browser, options)(1);
  await new Promise((resolve) => setTimeout(resolve, 1));
  browser.webNavigation.onErrorOccurred.emit({ tabId: 1, frameId: 0, error: 'net error' });
  assert.equal((await running).status, 'error');
  assert.equal(browser.requests, 1);
});

test('the step limit bounds redirect or history loops', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/a', 'https://shop.com/b', 'https://shop.com/c'] });
  const result = await createSuperBack(browser, { ...options, maxSteps: 2 })(1);
  assert.equal(result.status, 'limit');
  assert.equal(result.steps, 2);
  assert.equal(browser.requests, 2);
});

test('does not start traversal while the current page is still loading', async () => {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/'] });
  browser.setLoading(1);
  assert.equal((await createSuperBack(browser, options)(1)).status, 'loading');
  assert.equal(browser.requests, 0);
});
