# Execution ledger — plan: docs/superpowers/plans/2026-10-08-super-back.md

User approved design and explicitly requested building it. Native implementation proceeds in the new, empty superback project on feat/super-back; no existing checkout needs isolation.

Task 1: complete — 15 meaningful navigation/domain tests pass; tests first failed on absent navigation implementation. Uses native Back and a locally bundled Public Suffix List.

Task 2: complete — toolbar and command tests pass (20 total after review fix). Build and Mozilla linter succeed with zero manifest/code errors, warnings or notices. Seven integration checks pass in downloaded Firefox 157 with a disposable profile; shortcut is registered. ZIP integrity checked; contains only manifest, background bundle, icon and third-party license.

Ruling: Execute the approved design without another approval round — user explicitly said "Yes, build it". Design and plan are saved for review; no publication is authorized or attempted.

Ruling: Use an isolated new repository rather than a linked worktree — target folder contained no code or repository; no existing branch is modified.

Ruling: Native history exhaustion and stalled navigation share timeout feedback — Firefox does not expose canGoBack or the full Back stack. A 10-second wait bounds this ambiguity; oldest reachable location may remain, documented in README.

Integration fixture correction: ignore about:blank's stale completion when constructing HTTP history. Evidence was NS_BINDING_ABORTED on the first fixture URL after the driver mistakenly accepted about:blank completion. Wait for the exact requested fixture URL.

Test runner correction: use --test-isolation=none so this environment prints and counts each individual assertion rather than only child test files.

Final review: fresh independent reviewer found one material issue, now fixed. Unknown/local suffixes must compare by exact hostname; a regression test failed with office.internal instead of a.office.internal, then passed after using tldts parse's ICANN/private flags. Whole suite: 20/20 passing.

Verification limitation: Firefox's test runtime did not restore the cacheable fixture from BFCache, even after waiting for pageshow and leaving cache preferences at defaults. Cache restoration is reported as skipped; native Back and Forward behavior still passed. Browser toolbar/shortcut UI events are covered by Node handler tests rather than UI automation.

Ruling: Preserve the local project on feat/super-back — this new repository has no base branch or remote to merge or publish to. The deliverable is the built local extension and unsigned ZIP; signing is a separate external action.
