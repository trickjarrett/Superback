# Super Back for Firefox

Go back to the nearest earlier page on a different website in the current tab.

`Google → shop.com → shop.com/product → checkout.shop.com/cart`

Super Back returns to Google. Use the **double-chevron toolbar button** or **Alt+Shift+Left**. Activate it again while it is searching to cancel.

## Try it in Firefox

Requires Firefox desktop 140 or newer. The build is already in `extension/`.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json` inside this project (or the ZIP in `artifacts/`).
4. If the button is not visible, open Firefox's Extensions menu (puzzle piece), find **Super Back**, and choose **Pin to Toolbar**. You can position it beside Back using **Customize Toolbar**.
5. Browse between websites in one tab, then click Super Back or press **Alt+Shift+Left**.

Temporary add-ons are removed when Firefox restarts. For permanent installation in standard Firefox, the add-on needs Mozilla signing. The ZIP is unsigned and ready for submission through [Mozilla's self-distribution signing process](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/). Nothing has been submitted or published.

## Change the shortcut

Open `about:addons`, click the gear menu, choose **Manage Extension Shortcuts**, and change Super Back's shortcut. If your OS or another extension intercepts Alt+Shift+Left, choose another key combination there. On macOS the default uses Option+Shift+Left.

## How it behaves

- Only this tab's Back history is searched; other tabs and global browsing history are not consulted.
- Subdomains, HTTP/HTTPS changes and ports count as the same website. Public Suffix List rules handle domains such as `example.co.uk` and separate hosted sites such as `alice.github.io` and `bob.github.io`.
- Uses Firefox's native Back function, including entries created before installation. Forward history stays available.
- Hash and single-page app history entries are skipped too. Internal, file and other non-HTTP(S) pages are skipped when searching for an earlier website.
- Firefox does not expose the whole Back stack to ordinary extensions, so intermediate pages may briefly appear or reload. Website redirects or scripts may interrupt the search.
- If no earlier website exists, searching may leave the tab at its oldest entry, including an internal page such as `about:blank`. Hover the button for the result. A `!` badge indicates no target, a stalled/failed navigation, a page still loading, or the 200-step limit. Each Back step has a 10-second timeout.
- A second activation cancels further steps; a Back request already sent to Firefox may still finish. Normal navigation during the search also cancels further steps.

## Privacy and permissions

No analytics, remote code, external requests, or saved browsing records. The Public Suffix List is bundled locally. `tabs` allows reading the current URL; `webNavigation` allows waiting for main-frame history navigation. No permission to read website contents or global browsing history is requested. Private windows work only if you explicitly allow this extension in private windows in Firefox.

## Development

Node.js 22 or newer:

```sh
npm ci
npm test
npm run build
npm run lint
npm run package
```

`npm run package` writes `artifacts/super_back-1.0.0.zip`. The ZIP contains only the extension files, including the bundled domain parser and its license. Source, tests, dependencies and build tools stay outside it.

For real Firefox integration tests:

```sh
npx playwright install firefox
npm run test:browser
```

Or supply an existing Firefox executable:

```sh
npm run test:browser -- --firefox=/path/to/firefox
```

The integration runner uses an isolated temporary profile and a local fixture server. Extra scripting and localhost permissions exist only in its disposable test extension. It verifies native history, Forward history, SPA/hash traversal, duplicate URLs, bounded exhaustion, cancellation, domain matching and shortcut registration. It also checks whether Firefox restored a document from its Back/Forward cache and reports that coverage as skipped if this runtime chooses not to cache it. Unit tests additionally exercise the toolbar and command handlers. No browser UI automation is claimed.

Built with [Firefox WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions), [tldts](https://github.com/remusao/tldts), esbuild and web-ext.
