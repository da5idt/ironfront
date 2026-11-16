# Retro: spec #49, support and transport

Run 2026-11-16, started by the merge of the spec's last PR. Sources: the planning thread, the build thread, the five review threads, PRs #62, #65 and #67 and their review comments, and issues #63, #64, #66 and #68.

## What happened

Approved at 5:47 AM Central and merged by 8:29 AM the same morning: PR #62 (Hospital, Medic, Mechanic, Tend, Troop Carrier, Control Group number; two reviews), PR #65 (Board, Unload, pick-up, heal and repair controls; one review) and PR #67 (Computer Opponent, plus issue #63; one review). All two-way, all auto-merged. 953 tests at the end, up from 625. All twelve tickets were approved with one word, so none was stranded this time. Four issues of deferred review findings were filed; one (#63) was approved and fixed inside the round, three (#64, #66, #68) wait for triage.

## Findings, most severe first

| # | Category | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| 1 | Coding standards | The rules for Units that act by themselves were settled during the build, not in the spec, and each was rebuilt after a review. The Tend leash went through three designs (from the target's start; plus a memory of targets left at the leash; then "only a target that stands still" and a leash from a line). The pick-up rule went from "collects until full" to "once, on the Tick it stops" when branch review showed the first reading broke two other stories. The spec gave each rule one sentence. | PR #62 review 1 (must-fix), issue #63, PR #65 body, PR #67 body | A planning rule, not a code rule: when a spec has a Unit act without a Command, the spec says what starts it, what ends it, where any distance is measured from, and what happens when the target moves, for a single target and for a group. It belongs in the spec step (`/to-spec`), which is a vendored skill, so it would live as a line in `docs/workflow.md` step 2. | Candidate for da5idt |
| 2 | Information access | `docs/agents/issue-tracker.md` tells agents to comment, label and close with `gh issue ...` commands. Those use GraphQL, which cloud sessions cannot reach, so every build writes its own REST calls. In this build a closing comment was sent to `issues/63` instead of `issues/63/comments`, which replaced the issue's text. It was put back from a copy within two minutes. | Build thread, close-out of #63 | The REST form of comment, label, close and sub-issue calls is added to `docs/agents/issue-tracker.md`, with the warning that a POST or PATCH to the issue itself edits it. | In the retro PR |
| 3 | Automated checks | Whether the Computer Opponent got weaker was found only because the build thread wrote a throwaway harness that plays whole Matches and prints wave sizes, army counts and the Victory Tick. The first version of the Opponent change bought support before its first wave and cut the army at Tick 5400 from 21 to 13; no test failed. The same harness was written from scratch for spec #33. | PR #67 body, PR #44 body | Keep one harness in the repo (for example `src/opponent/measure.ts` behind an `npm run measure` script) that prints the table for `main` and for the branch, and have any PR that touches `src/opponent/` paste it. A new script is a package file change, so da5idt decides. | Candidate for da5idt |
| 4 | Coding standards | Words under Avoid in `GLOSSARY.md` reached `main` in all three PRs ("loaded", "game", "turn", "pick-up", "helper"), each time noted by the final review as a small thing and deferred. | Issues #64, #66, #68, section "Words" | A check in `tools/check_house_rules.py` over comments and names in `src/` could catch the clear ones (Load, Rider). Several avoided words are ordinary English or part of a path (`src/game/`, "turn"), so a naive check would mostly raise false alarms; it needs a short allow list. The spec itself used "loaded Troop Carrier", so the spec step is where the word should be caught first. | Candidate for da5idt |
| 5 | Coding standards | A fix made by a worker for one review finding added a rule of its own: a Passenger's reload was reset on entering a Troop Carrier, which would have let a Player fire faster by getting in and out. It was caught by reading the worker's diff, not by a test or a review. | Build thread, PR #65 fixes | None added. The rule "a fix changes only what the finding names" is already how review works; the lesson is that the build thread reads every worker diff before it merges it, which it did. | No action |
| 6 | Navigation | Worker worktrees live under `.claude/worktrees/`, which git reported as untracked in the main checkout on every status. Committing it would have turned a two-way PR into a one-way one. The build thread hid it in `.git/info/exclude`, which the next session will not have. | Build thread | `.claude/worktrees/` is added to `.gitignore`. | In the retro PR |
| 7 | Tool economy | Review workers were first pointed at the main checkout while the merged stage lived elsewhere, so one review read the wrong tree and had to be run again. | Build thread, PR #65 branch review | None in the repo: the build thread now keeps each stage in its own worktree and names that path in the review brief. | No action |
| 8 | Automated checks | `Closes #n` lines in a PR body did not close the tickets when the PR was merged by `tools/auto_merge.py`, so the build thread closed twelve tickets by hand. Seen in every spec so far. | PRs #62, #65, #67 | As already proposed in the spec #2 retro: `auto_merge.py` closes the issues a PR names. A door-rules file, so da5idt decides. | Candidate for da5idt (third time seen) |
| 9 | Coding standards | The "new test is seen to fail without the change" rule from the last retro worked: the final reviewers ran the new tests against the old code each time, and PR #67 listed the seven guard tests that pass either way and why. The PR template still has no place for that line. | PR #67 body and review; issue #47 | Issue #47 is already approved and open. | No action |

## What worked

- Filing deferred review findings as issues (new since the last retro) kept them from being lost: #63 was picked up and fixed two PRs later because it was an issue da5idt could approve with one tap.
- One word of approval for all twelve tickets meant the build never waited on a label.
- The final review held PR #62 for a real bug (a Medic that gave up at the leash never went back to that Unit) that the branch review had missed, and passed the other two on the first run.
- Building tickets in parallel worktrees and merging them into a stage branch let twelve tickets land in under three hours; the price was a hand-merge of `src/sim/state.ts` each time two tickets added a field.

## Open calls for da5idt from this round

None blocks anything.

- A hurt group that marches in stop-and-go hops can still pull an idle Medic along (the part of #63 left as it was; the final review recommends accepting it).
- The Computer Opponent's army is smaller for a while after its first wave, because support costs Credits; a mirror Match ends about three minutes later.
- The Computer Opponent never retreats, so its Medics only heal defenders (story 45; #68 section 5).
- A Troop Carrier collects once, on the Tick it stops after an empty move, and not at all if it is hit on that Tick. A parked one that is told to move to its own Cell collects again, and pick-up reaches across water (#66).
- The Control Group number covers a corner of the Unit below it at the widest zoom; buttons lose their hint line on a 600 px tall window; a dead Medic or Mechanic uses the Rifleman body picture; the A key arms Attack-move for unarmed Units; five dark Passenger places always show on a Troop Carrier; U on an empty Troop Carrier is accepted.
- Three issues wait for triage: #64, #66, #68.
