import { createSuperBack, getSiteKey } from './navigation.js';

const messages = {
  cancelled: 'Super Back — cancelled',
  loading: 'Super Back — wait for this page to finish loading',
  timeout: 'Super Back — no earlier website found, or Back navigation did not finish',
  limit: 'Super Back — stopped after 200 steps; activate again to continue',
  error: 'Super Back — Firefox could not complete Back navigation',
};

export function registerBackground(browser) {
  const run = createSuperBack(browser);
  const current = new Map();
  const display = async (tabId, text, title) => {
    // A tab can disappear between its navigation result and the UI update.
    await Promise.all([
      browser.action.setBadgeText({ tabId, text }),
      browser.action.setBadgeBackgroundColor({ tabId, color: '#5955c9' }),
      browser.action.setTitle({ tabId, title }),
    ]).catch(() => {});
  };
  const activate = async (tabId) => {
    if (!Number.isInteger(tabId)) return;
    const token = Symbol();
    current.set(tabId, token);
    // Start synchronously to establish the per-tab lock before another click.
    const pending = run(tabId);
    await display(tabId, '…', 'Super Back — searching; activate again to cancel');
    const result = await pending;
    if (current.get(tabId) !== token) return;
    const title = result.status === 'found'
      ? `Super Back — returned to ${getSiteKey(result.url)}`
      : messages[result.status];
    const text = ['found', 'cancelled'].includes(result.status) ? '' : '!';
    await display(tabId, text, title);
    if (current.get(tabId) === token) current.delete(tabId);
  };
  browser.tabs.onRemoved.addListener((tabId) => current.delete(tabId));
  browser.action.onClicked.addListener((tab) => activate(tab.id));
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'super-back') return;
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab) await activate(tab.id);
    } catch {
      // A window can close while resolving its active tab.
    }
  });
}

if (globalThis.browser) registerBackground(globalThis.browser);
