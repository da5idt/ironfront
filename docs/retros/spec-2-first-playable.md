# Retro: spec #2, first playable prototype

Run 2026-11-15. Sources: the build thread, the four review threads, PRs #13, #14 and #15 and their review comments.

## What happened

Built on 2026-11-13 in about two hours: PR #14 (skeleton, one-way) and PR #15 (tickets #4 to #12, two-way, auto-merged). 234 tests at the end. PR #15 took two fresh final reviews; the first found three must-fix bugs that the branch review had missed.

## Findings, most severe first

| # | Category | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| 1 | Coding standards | Fog of War leaks were found three times by three different reviews: shot tracers (branch review), Fogged Ore read live through a Command rejection, and `placeBuilding` rejections revealing hidden Units (final review of #15). | PR #15 review 1, items 1 and 6; build thread 2026-11-13 | A judgement rule in `CODING_STANDARDS.md`: what a Player learns comes only from that Player's view, and a rejection counts as learning. | In the retro PR |
| 2 | Automated checks | ADR 0002 (no clock, DOM or `Math.random` in the Simulation) had no check. The only guard was a determinism test that, in PR #14, could not fail. | PR #14 review, item 1 | `tools/check_house_rules.py`, run in the `checks` job, fails on a banned API in `src/sim`, `src/opponent` or `src/game`. | In the retro PR |
| 3 | Automated checks | An auto-merge by `github-actions[bot]` closed no issue. The build thread closed spec #2 and tickets #3 to #12 by hand over REST. If that thread had ended first, the spec would have stayed open and `in-progress`, and the hourly pickup would have refused every later spec. | Issue close times 2026-11-13 15:27:44 to 15:28:08 UTC, two seconds apart | `tools/auto_merge.py` closes the issues the PR body names after it merges. | Candidate for da5idt |
| 4 | Automated checks | Command targets were validated per handler, and a fractional Cell got through. Fixed once in `issueCommand`. | PR #15 review 1, item 2 | None beyond the fix: one occurrence, now tested. | No action |
| 5 | Navigation | `CLAUDE.md` and `docs/workflow.md` kept saying the game had no code after PR #14. `CLAUDE.md` was fixed then; `docs/workflow.md` still said it, and still described shadow mode as on. | PR #14 review, item 5 | Correct `docs/workflow.md`. | In the retro PR |
| 6 | Tool economy | Every PR got two comments from the Codex review bot saying its usage limit was reached. Each reviewer and PR-watch run reads them. | PRs #14, #15, #27, #28, first two comments | Turn the Codex reviewer off for this repo (a GitHub App setting only da5idt can change). | Candidate for da5idt |
| 7 | Tool economy | The hourly pickup and PR watch open a thread every run, about 36 a day, and roughly a third stay unresolved though nothing happened. | Thread list 2026-11-13 to 2026-11-15 | The pickup prompt now ends a quiet run by resolving its thread. The same line fits the PR watch. | Pickup done; PR watch is a candidate |
| 8 | No-ops | The retro step said "after a spec's last PR" with no owner, so the build thread offered a retro and waited. Nobody ran one for two specs. | Build thread, last message | The workflow now starts the retro itself. See `docs/workflow.md` step 10. | In the retro PR |

## What worked

- One integration branch and one PR for nine tickets kept the review to a single diff.
- The fresh-context final review earned its place: it found three bugs after the branch review had passed the branch.
