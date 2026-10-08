# Super Back Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. User explicitly requested building the approved design; execute inline.

**Goal:** Deliver a Firefox toolbar action and shortcut that go Back to another website.

**Architecture:** A local domain classifier and event-driven navigator wrap Firefox's native history APIs. A small background entry connects toolbar and command handlers and presents result feedback. Bundle code and dependencies into the extension directory.

**Tech Stack:** JavaScript, Node test runner, tldts, esbuild, web-ext, Firefox.

**Spec:** ../specs/2026-10-08-super-back-design.md

## Global Constraints

- Minimum Firefox desktop version: 140.0.
- Manifest V3; permissions tabs and webNavigation only.
- Alt+Shift+Left; registrable domain grouping including private suffixes.
- No remote services, telemetry, persistent URL storage, or publication.
- 10-second step timeout and 200-step maximum.

## Review Focus

- Back API resolves before page changes: wait for completion events.
- Identical URLs and same-document history: events, not URL comparisons, mark progress.
- User actions during traversal: cancel rather than hijack subsequent navigation.
- Public suffixes and shared hosting: compare registrable domains, not last two labels.
- History exhaustion: finish boundedly and explain the resulting location.

### Task 1: Navigation engine

**Files:** src/navigation.js; tests/navigation.test.js; tests/fake-browser.js.

**Interfaces:** getSiteKey(url) returns string or null. createSuperBack(browser, {timeoutMs?, maxSteps?}) returns run(tabId), resolving {status, steps, url?}.

- [ ] Write failing tests for the review focus and cancellation, iframe filtering, tab closure, API errors and step limits.
- [ ] Run `npm test`; expect failures because navigation.js does not yet exist.
- [ ] Implement domain classification and main-frame event waits, with per-tab cancellation.
- [ ] Run `npm test`; expect all assertions to pass.

### Task 2: Firefox integration and package

**Files:** src/background.js; extension/manifest.json; extension/icons/super-back.svg; scripts/build.js; scripts/test-browser.js; tests/browser-driver.js; README.md.

**Interfaces:** imports createSuperBack from Task 1; background binds action and command to run(tabId). Build produces extension/background.js.

- [ ] Add a Firefox integration driver that builds native history on local pages, verifies landing at another host, Forward history, hashes, duplicate URLs, and cancellation.
- [ ] Run the integration check against the pre-integration build; confirm missing extension configuration prevents loading.
- [ ] Implement toolbar/command binding, manifest, icon, bundling and local test runner.
- [ ] Run `npm test`, `npm run build`, `npm run lint`, and `npm run test:browser`; investigate any failures.
- [ ] Write loading, shortcut customization, behavior limits, development, privacy and signing instructions.
- [ ] Run `npm run package`; inspect ZIP entries and rerun checks if code changes.
