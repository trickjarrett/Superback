# Super Back

Build a Firefox desktop extension in this directory. The user approved the design and explicitly requested implementation on 2026-10-08.

## Behavior

The toolbar button and Alt+Shift+Left shortcut walk backward through the current tab's native session history, stopping at the nearest earlier HTTP(S) page belonging to another website. Subdomains of a registrable domain are one website. Public suffix rules include private suffixes: alice.github.io and bob.github.io are different websites. Schemes and ports do not define different websites. IP addresses and local hostnames compare by hostname. Internal and non-web pages are skipped while searching; starting on such a page is allowed.

Native history works for pages visited before installation and preserves Forward history. Firefox has no API exposing the tab's complete Back stack, so intermediate pages can appear. If no different website exists, stop at the earliest reachable entry, with feedback in the toolbar title and badge. Do not claim that the original location is preserved in that case.

## Implementation

Use Manifest V3 with an event background script, action button defaulting to the navigation toolbar, and commands. Minimum Firefox desktop version: 140.0. Request only tabs and webNavigation permissions. No content scripts, history permission, remote services, telemetry, or persistent URL storage. Bundle Public Suffix List parsing locally.

Wait for main-frame navigation events rather than assuming tabs.goBack resolves after navigation. Handle same-document history including hashes and duplicate URLs. Ignore iframe and unrelated-tab events. Stop on unexpected user navigation, a closed tab, a failed navigation, or a 10-second step timeout; cap a run at 200 steps. Activating Super Back again cancels the current run. Cancellation stops subsequent steps; an already requested Back navigation may finish.

The toolbar shows a busy badge while navigating, then concise result feedback. Tooltips explain timeout/no-target/error results. Keyboard customization uses Firefox's built-in Manage Extension Shortcuts screen.

## Verification and delivery

Node tests cover domain matching, native traversal, forward preservation, identical URLs, hashes, concurrent tabs, cancellation, user navigation, errors and timeouts. Run real Firefox integration against local pages if a Firefox binary can be provisioned. Build and lint with web-ext, and deliver an unsigned extension ZIP with clear temporary-loading and signing instructions. Do not publish or submit for signing.
