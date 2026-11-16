# Retro: spec #16, look and feel

Run 2026-11-15. Sources: the build thread, the five review threads, PRs #27 and #28 and their review comments.

## What happened

Built on 2026-11-13 and 2026-11-14 in about two and a half hours: PR #27 (controls, two reviews) and PR #28 (art and sound, 79 files, three reviews). Both two-way, both auto-merged. 537 tests at the end. Each extra review round came from one must-fix the round before had not seen.

## Findings, most severe first

| # | Category | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| 1 | Coding standards | Both must-fix regressions on PR #28's first two reviews showed only in the running game: the sound strip over the Turret button at 1366x657, and alerts spoken after "Defeat". The branch review read the diff and counted 95 of 104 spec items met; the final reviewers ran the build in headless Chromium and found them at once. | PR #28 reviews 1 and 2 | A review rule: a change under `src/client` is reviewed by running the built game at a laptop size and pressing every button. The branch review follows it too, so the first final review starts cleaner. | In the retro PR |
| 2 | Coding standards | Glossary "Avoid" words were flagged in four of five reviews: "base", "order" (`orderAck`), "the player", "soldier". | PR #27 reviews 1 and 2; PR #28 reviews 1, 2 and 3 | A review rule. A script cannot do this: "frame", "update", "level" and "order" are all ordinary words in other senses. | In the retro PR |
| 3 | Coding standards | The builder kept a dead file because "deleting a file is a one-way door", although the file was new on the branch. | PR #28 review 1, item 3 | The door table now says a deletion is a file that exists on `main`, which is what `door_gate.py` already checks. | In the retro PR |
| 4 | Automated checks | The door rule for data leaving the machine matches the plain word for following something (`\btracking\b`) on any changed line, so builders had to avoid an ordinary word in code and docs. | Build notes for spec #16 | Narrow the pattern in `.github/aihero.yaml`, for example to `tracking (id|pixel|script|cookie)`. A door-rule change, so da5idt decides. | Candidate for da5idt |
| 5 | Coding standards | Review findings put off to "a later PR" lived only in PR comments and thread notes. One deferral to ticket #20 was never written on #20. | PR #27 review 2, item 2 | The final review files each deferred finding as an issue labelled `needs-triage` before it comments. | Candidate for da5idt |
| 6 | Automated checks | Test fakes that disagreed with the real system were found in three reviews, though the rule exists. Review caught each one, which is where the rule is meant to bite. | PR #27 review 2; PR #28 reviews 1 and 2 | None. | No action |
| 7 | Information access | Nobody could hear the sound. The build measured it (non-silent, in key, below clipping) and da5idt listened afterwards. | PR #28 body | None available in a cloud session. Ask da5idt to listen as soon as a sound PR is ready, not after it merges. | No action |
| 8 | Tool economy | Build notes for the ticket workers lived in a temp folder and one ticket sat on an unpushed local branch for an hour. Nothing was lost, but a container restart would have lost both. | Build notes for spec #16 | Push work in progress to the thread's branch after each ticket. Already what `/implement-spec` asks; no rule added. | No action |

## What worked

- Shipping the two control fixes first as their own small PR put them in da5idt's hands in 20 minutes.
- Layout tests that sweep window heights (added after review 2) ended the short-window findings.
