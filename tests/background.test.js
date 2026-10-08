import test from 'node:test';
import assert from 'node:assert/strict';
import { registerBackground } from '../src/background.js';
import { fakeBrowser, event } from './fake-browser.js';

function uiBrowser() {
  const browser = fakeBrowser({ 1: ['https://origin.com/', 'https://shop.com/a', 'https://shop.com/b'] });
  const badges = new Map();
  const titles = new Map();
  browser.action = {
    onClicked: event(),
    async setBadgeText({ tabId, text }) { badges.set(tabId, text); },
    async setBadgeBackgroundColor() {},
    async setTitle({ tabId, title }) { titles.set(tabId, title); },
  };
  browser.commands = { onCommand: event() };
  browser.tabs.query = async () => [await browser.tabs.get(1)];
  return { browser, badges, titles };
}

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('Background action did not finish');
}

test('toolbar activation traverses history and clears busy feedback on success', async () => {
  const { browser, badges, titles } = uiBrowser();
  registerBackground(browser);
  browser.action.onClicked.emit({ id: 1 });
  await waitFor(() => titles.get(1)?.includes('origin.com'));
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
  assert.equal(badges.get(1), '');
});

test('keyboard command acts on the active tab', async () => {
  const { browser, titles } = uiBrowser();
  registerBackground(browser);
  browser.commands.onCommand.emit('super-back');
  await waitFor(() => titles.get(1)?.includes('origin.com'));
  assert.equal((await browser.tabs.get(1)).url, 'https://origin.com/');
});

test('an unrelated command never navigates', async () => {
  const { browser } = uiBrowser();
  registerBackground(browser);
  browser.commands.onCommand.emit('something-else');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(browser.requests, 0);
});

test('loading page gets useful feedback instead of a Back request', async () => {
  const { browser, titles, badges } = uiBrowser();
  browser.setLoading(1);
  registerBackground(browser);
  browser.action.onClicked.emit({ id: 1 });
  await waitFor(() => titles.get(1)?.includes('finish loading'));
  assert.equal(browser.requests, 0);
  assert.equal(badges.get(1), '!');
});
