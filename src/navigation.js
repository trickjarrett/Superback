import { parse } from 'tldts';

export function getSiteKey(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const domain = parse(hostname, { allowPrivateDomains: true });
    return (domain.isIcann || domain.isPrivate) ? (domain.domain || hostname) : hostname;
  } catch {
    return null;
  }
}

function historyStep(browser, tabId, signal, timeoutMs) {
  return new Promise((resolve) => {
    let committed = false;
    let finished = false;
    const registrations = [];
    let timer;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const [event, listener] of registrations) event.removeListener(listener);
      signal.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => finish({ status: 'cancelled' });
    const matches = (details) => details.tabId === tabId && details.frameId === 0;
    const isHistory = (details) => details.transitionQualifiers?.includes('forward_back');
    const listen = (event, listener) => {
      event.addListener(listener);
      registrations.push([event, listener]);
    };
    listen(browser.webNavigation.onCommitted, (details) => {
      if (!matches(details)) return;
      if (!isHistory(details)) return cancel();
      committed = true;
    });
    listen(browser.webNavigation.onCompleted, (details) => {
      if (matches(details) && committed) finish({ status: 'moved', url: details.url });
    });
    const sameDocument = (details) => {
      if (!matches(details)) return;
      if (!isHistory(details)) return cancel();
      finish({ status: 'moved', url: details.url });
    };
    listen(browser.webNavigation.onHistoryStateUpdated, sameDocument);
    listen(browser.webNavigation.onReferenceFragmentUpdated, sameDocument);
    listen(browser.webNavigation.onErrorOccurred, (details) => {
      if (matches(details)) finish({ status: 'error', error: details.error });
    });
    signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => finish({ status: 'timeout' }), timeoutMs);
    if (signal.aborted) return cancel();
    // Register listeners before initiating navigation. Firefox resolves goBack
    // when it requests Back, so its promise cannot be used as a load barrier.
    Promise.resolve().then(() => {
      if (!signal.aborted) return browser.tabs.goBack(tabId);
    }).catch((error) => finish({ status: 'error', error: error.message }));
  });
}

export function createSuperBack(browser, { timeoutMs = 10_000, maxSteps = 200 } = {}) {
  const active = new Map();
  browser.tabs.onRemoved.addListener((tabId) => active.get(tabId)?.abort());

  return async function run(tabId) {
    if (active.has(tabId)) {
      active.get(tabId).abort();
      return { status: 'cancelled', steps: 0 };
    }
    const controller = new AbortController();
    active.set(tabId, controller);
    let steps = 0;
    try {
      const initial = await browser.tabs.get(tabId);
      if (controller.signal.aborted) return { status: 'cancelled', steps };
      if (initial.status === 'loading') return { status: 'loading', steps };
      const startingSite = getSiteKey(initial.url);
      while (steps < maxSteps) {
        if (controller.signal.aborted) return { status: 'cancelled', steps };
        const result = await historyStep(browser, tabId, controller.signal, timeoutMs);
        if (result.status !== 'moved') return { ...result, steps };
        steps++;
        const site = getSiteKey(result.url);
        if (site && site !== startingSite) return { status: 'found', steps, url: result.url };
      }
      return { status: 'limit', steps };
    } catch (error) {
      return { status: controller.signal.aborted ? 'cancelled' : 'error', steps, error: error.message };
    } finally {
      active.delete(tabId);
    }
  };
}
