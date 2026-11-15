# Retro: spec #33, army controls

Run 2026-11-15, started by the merge of the spec's last PR. Sources: the planning thread, the build thread, the review threads, PRs #41 to #44 and their review comments.

## What happened

Planned, approved and built in one afternoon, 2026-11-15: PR #41 (keys, Control Groups, double-click select), PR #42 (Attack-move and its keys, two reviews), PR #43 (zoom) and PR #44 (Computer Opponent uses Attack-move, two reviews). All two-way, all auto-merged. 625 tests at the end. The seven tickets were approved in three batches, and the last one was built on its own, merging an hour after the rest.

## Findings, most severe first

| # | Category | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| 1 | Coding standards | A new test was written after the code and never run against the old code. It passed on `main` too, so the acceptance criterion it stood for had no test. The reviewer found this by running it on `main`; the builder had not. Earlier in the spec, a Fog of War test would still have passed with the visibility check removed; there the author had a sound reason (a hidden enemy in weapon range cannot be staged through the seam) and said so. | PR #44 review 1, finding 2; PR #42 review 1, note 3 | A review rule: the PR says each new test was seen to fail without the change, or why it cannot be made to, and the reviewer spot-checks one. | In the retro PR |
| 2 | Coding standards | A review note put off as "a call for David in a later round" (a Unit does not answer a Turret that out-ranges it) lived only in a PR comment. Two PRs later the same gap came back as a must-fix in the Computer Opponent. This is the second spec where a deferred finding was lost: see finding 5 of the spec #16 retro. | PR #42 review 1, note 2; PR #44 review 1, finding 1 | As proposed in the spec #16 retro: the final review files each deferred finding as an issue labelled `needs-triage` before it comments. Now seen twice. | Candidate for da5idt |
| 3 | Navigation | Tickets approved after a build has started are stranded. The hourly pickup skips a spec that is already assigned, and the build thread only builds what was `ready-for-agent` when it looked. Ticket #39 waited until da5idt was asked about it in the planning thread. | Build notes for spec #33; planning thread | Two parts. The planning thread offers one word ("approve") that labels every ticket at once, which it did this time but after da5idt had begun labelling by hand. And the hourly pickup also takes an unassigned `ready-for-agent` ticket whose spec is assigned but has no working thread. The second part changes a scheduled task, so da5idt decides. | Candidate for da5idt |
| 4 | Coding standards | Replacing the Opponent's own target chooser with the Simulation's Attack-move rule dropped one thing the old chooser did (go for a Turret within eight Cells). Its tests were deleted with it, so nothing failed. | PR #44 review 1, finding 1 | Covered by finding 1's rule in spirit, and review caught it. When a function is removed, its tests are the list of behaviours to re-home; no separate rule added. | No action |
| 5 | Information access | Screenshots for PRs #41 to #44 could not be published: a build session may push only its own branch, so the `pr-assets` branch used in the first two specs was out of reach. PR bodies described the screenshots in words and the files sit in the project's shared folder. | PR #41 to #44 bodies | None in the repo. The reviewers ran the game themselves, which is the check that matters. | No action |
| 6 | Automated checks | `README.md` still said W, A, S and D scroll the Map after PR #41 freed those keys. No check ties the README to the key table, and the README is a one-way file the two-way build could not touch. | Build notes for spec #33 | Fixed here. A check would need the README to be generated from the key table, which is more than a four-line section deserves. | In the retro PR |
| 7 | Tool economy | The review bot from another vendor posted two "usage limit reached" comments on every PR and reviewed nothing. Each one woke the build thread. | PRs #30, #41 to #44 | Turn the bot off for this repo, as the spec #16 retro already proposes. A repo setting, so da5idt decides. | Candidate for da5idt |

## What worked

- The final review of PR #42 found Units on an Attack-move stacking on one spot, and its re-review found the follow-on (a Unit crossing a Building's Cell after its side step), both before anything merged.
- Measuring whole Matches before and after on the same seeds (PR #44) showed the 30-minute bound gained slack, so the PR could say so with numbers.
- Asking for the key layout on a card while the spec was being written cost no time: the spec assumed the recommended option and needed a two-line edit.
- The out-of-scope list in the spec held. Nothing was added to the round while it was being built.

## Open calls for da5idt from this round

None blocks anything.

- At the widest zoom the Control Group number on a Unit is 3 by 5 screen pixels and hard to read.
- A Unit on an Attack-move walks past a Turret that out-ranges it without shooting back. The Computer Opponent now works round this for its own waves; the person playing still has to target the Turret by hand.
- Two quick Shift+clicks on one Unit now add all Units of its kind where they used to toggle the Unit.
- The Computer Opponent's direct-attack fallback (a wave Unit standing with nothing in range) has no test of its own and did not fire in any whole Match measured.
