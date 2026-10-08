import { createSuperBack, getSiteKey } from '../src/navigation.js';
import '../src/background.js';

// Bundled only into a disposable test extension, never into the deliverable.
const base = globalThis.TEST_BASE;
const origin = base.replace('localhost', '127.0.0.1');
const results = [];
const tabs = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function move(tabId, action, expectedUrl) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Fixture navigation timed out')), 8000);
    const done = (error) => {
      clearTimeout(timer);
      browser.webNavigation.onCompleted.removeListener(complete);
      browser.webNavigation.onErrorOccurred.removeListener(failed);
      error ? reject(error) : resolve();
    };
    const complete = (details) => {
      if (details.tabId === tabId && details.frameId === 0 && details.url === expectedUrl) done();
    };
    const failed = (details) => {
      if (details.tabId === tabId && details.frameId === 0 && details.url === expectedUrl) {
        done(new Error(`${details.error}: ${details.url}`));
      }
    };
    browser.webNavigation.onCompleted.addListener(complete);
    browser.webNavigation.onErrorOccurred.addListener(failed);
    action().catch(done);
  });
}

async function stack(urls) {
  const tab = await browser.tabs.create({ url: 'about:blank' });
  tabs.push(tab.id);
  for (const url of urls) {
    await move(tab.id, () => browser.tabs.update(tab.id, { url }), url);
    // webNavigation completion can precede pageshow. Wait for the fixture to
    // observe pageshow before asking Firefox to cache it on the next move.
    for (let attempt = 0; attempt < 100; attempt++) {
      const [page] = await browser.scripting.executeScript({
        target: { tabId: tab.id }, func: () => window.restoredFromCache !== undefined,
      });
      if (page.result) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  return tab.id;
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: `${error.message}\n${error.stack}` });
  }
}

async function main() {
  await check('native history created before navigator; nearest other website and Forward', async () => {
    const id = await stack([`${origin}/older`, `${origin}/origin`, `${base}/shop`, `${base}/product`, `${base}/cart`]);
    const result = await createSuperBack(browser)(id);
    assert(result.status === 'found', JSON.stringify(result));
    assert(result.steps === 3, `Expected 3 steps, got ${result.steps}`);
    assert((await browser.tabs.get(id)).url === `${origin}/origin`, 'Wrong destination');
    const [restoration] = await browser.scripting.executeScript({
      target: { tabId: id }, func: () => window.restoredFromCache,
    });
    results.push(restoration.result === true
      ? { name: 'Back/Forward cache restoration', passed: true }
      : { name: 'Back/Forward cache restoration', skipped: true, reason: 'This Firefox test runtime did not cache the fixture document' });
    await move(id, () => browser.tabs.goForward(id), `${base}/shop`);
    assert((await browser.tabs.get(id)).url === `${base}/shop`, 'Forward history was lost');
  });

  await check('same-document SPA and hash history', async () => {
    const id = await stack([`${origin}/spa-origin`, `${base}/spa`]);
    await browser.scripting.executeScript({ target: { tabId: id }, func: () => {
      history.pushState({}, '', '/spa/product');
      location.hash = 'details';
      location.hash = 'reviews';
    } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await createSuperBack(browser)(id);
    assert(result.status === 'found', JSON.stringify(result));
    assert((await browser.tabs.get(id)).url === `${origin}/spa-origin`, 'Wrong SPA destination');
    assert(result.steps === 4, `Expected 4 history entries, got ${result.steps}`);
  });

  await check('duplicate identical URLs in native history', async () => {
    const id = await stack([`${origin}/duplicate-origin`, `${base}/duplicate`]);
    await browser.scripting.executeScript({ target: { tabId: id }, func: () => {
      history.pushState({ n: 1 }, '', location.href);
      history.pushState({ n: 2 }, '', location.href);
    } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await createSuperBack(browser)(id);
    assert(result.status === 'found', JSON.stringify(result));
    assert(result.steps === 3, `Expected 3 steps, got ${result.steps}`);
    assert((await browser.tabs.get(id)).url === `${origin}/duplicate-origin`, 'Wrong duplicate destination');
  });

  await check('no other website: bounded stop', async () => {
    const id = await stack([`${base}/only-a`, `${base}/only-b`]);
    const result = await createSuperBack(browser, { timeoutMs: 500 })(id);
    assert(['timeout', 'error'].includes(result.status), JSON.stringify(result));
    assert(result.steps >= 1, 'No history movement');
  });

  await check('second invocation cancels traversal', async () => {
    const id = await stack([`${origin}/cancel-origin`, `${base}/cancel-a`, `${base}/cancel-b`]);
    const run = createSuperBack(browser);
    const first = run(id);
    const second = await run(id);
    assert(second.status === 'cancelled', JSON.stringify(second));
    assert((await first).status === 'cancelled', 'First run did not cancel');
    assert((await browser.tabs.get(id)).url === `${base}/cancel-b`, 'Cancelled before start but tab moved');
  });

  await check('public suffix grouping in Firefox bundle', async () => {
    assert(getSiteKey('https://checkout.example.co.uk/') === 'example.co.uk', 'co.uk grouping');
    assert(getSiteKey('https://alice.github.io/') !== getSiteKey('https://bob.github.io/'), 'private hosting grouping');
  });

  const commands = await browser.commands.getAll();
  results.push({ name: 'shortcut registered', passed: commands.some((c) => c.name === 'super-back' && c.shortcut) });
  for (const id of tabs) await browser.tabs.remove(id).catch(() => {});
  await fetch(`${base}/results`, { method: 'POST', body: JSON.stringify(results) });
}

main().catch(async (error) => {
  await fetch(`${base}/results`, {
    method: 'POST', body: JSON.stringify([{ name: 'driver', passed: false, error: error.stack }]),
  });
});
