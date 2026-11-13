# Development workflow

How a change gets from idea to merged in Ironfront. Agents do the planning, building and reviewing with Matt Pocock's skills (in `.claude/skills/`). da5idt approves the plan and merges risky changes. GitHub Actions run only deterministic checks.

```mermaid
flowchart TD
    A([New work requested]) --> B{How big?}
    B -->|Small| C["/grill-me"]
    B -->|Medium| D["/grill-with-docs"]
    B -->|Large| E["/wayfinder"]
    C --> F["/to-spec: spec issue"]
    D --> F
    E --> F
    F --> G["/to-tickets: sub-issues with blocking edges"]
    G --> H{"da5idt approves tickets?"}
    H -->|Needs changes| F
    H -->|"Yes: ready-for-agent"| I[Agent claims the spec]
    I --> J["/implement-spec: task-graph loop, /tdd per ticket"]
    J --> K["/code-review the branch, fix findings"]
    K --> L["/pr: PR body with a Door line"]
    L --> M[CI checks and door-gate]
    M -->|Red| N[Agent fixes on the branch] --> M
    M -->|Green| O["Final /code-review in a fresh context"]
    O --> P{door-review comment}
    P -->|Fixes needed| N
    P -->|one-way| Q["da5idt reviews and merges"]
    P -->|two-way| R{"auto-merge gates pass?<br/>label, body, review, checks,<br/>merge window, no freeze"}
    R -->|Not yet| S[Retry every 30 min] --> R
    R -->|Yes, shadow mode| T[Label would-auto-merge] --> Q
    R -->|Yes, live| U[Auto-merge]
    Q --> V([Merged])
    U --> V
    V --> W[Daily digest issue on days with auto-merges]
    V --> X{Last PR of the spec?}
    X -->|No| J
    X -->|Yes| Y["/retro: one-way PR with environment fixes"]
```

## Steps
1. **Plan.** The agent sizes the work and grills da5idt with `/grill-me`, `/grill-with-docs` or `/wayfinder`.
2. **Spec and tickets.** `/to-spec` writes a spec issue. `/to-tickets` splits it into sub-issues that say which tickets block which.
3. **Approval.** da5idt labels the tickets `ready-for-agent`. Nothing is built before this.
4. **Build.** `/implement-spec` works the ticket graph: up to 4 tickets in parallel, one spec at a time, 60 minutes per run.
5. **Branch review.** `/code-review` checks the branch against `CODING_STANDARDS.md` and the spec, and the agent fixes what it finds.
6. **Pull request.** `/pr` writes the body. Its **Door** line says one-way or two-way, following the door table below.
7. **Checks.** CI and `door-gate` run. `door-gate` labels the PR, and the strictest of the PR body, the final review and `tools/door_gate.py` wins.
8. **Final review.** A fresh agent that never saw the build runs `/code-review` and comments `door-review: two-way` or `door-review: one-way`.
9. **Merge.** da5idt merges one-way doors. Two-way doors auto-merge when every gate passes. Agents never merge.
10. **Retro.** After a spec's last PR, `/retro` proposes fixes to the environment. A retro PR is always one-way.

## Door table
- **Two-way (auto-merge):** new gameplay features, units, buildings and AI behavior; balance and parameter tweaks; bug fixes, tests and refactors inside the game code; docs other than the rules files.
- **One-way (da5idt merges):** CI and GitHub Actions; door rules and `tools/`; `CLAUDE.md`, `CODING_STANDARDS.md`, `docs/agents/`, this file and the vendored skills; deleting any file; dependency and lockfile changes; build and deploy config; save-game and map file formats; anything that sends data off the player's machine (network, analytics, telemetry); `LICENSE`, `README.md` and third-party assets (art, sound, fonts).

The path and content rules behind this table live in `.github/aihero.yaml`, and `tests/test_door_gate.py` checks them in CI.

## CI
The `checks` job runs actionlint, compiles the door scripts, and runs the door-gate tests. The game has no code yet: the first game spec picks the stack and adds its lint, typecheck and test steps to `checks`.

## Auto-merge gates
A two-way PR merges only when all of these hold: the `two-way-door` label, `**Door:** two-way` in the body, a `door-review: two-way` comment from da5idt newer than the last commit, all checks green, inside the merge window (any hour, America/Chicago), and no freeze. There is no freeze command; setting the repo variable `MERGE_FREEZE` to `true` pauses all auto-merges. Until the repo variable `AUTO_MERGE_ENABLED` is `true`, the repo is in shadow mode (planned for 2 weeks): PRs that would merge get the `would-auto-merge` label, and da5idt merges them.

## Scheduled jobs
- **auto-merge** (GitHub Actions): every 30 minutes, and on each new PR comment.
- **Hourly pickup** (Claude scheduled task): at :20 past each hour Central, starts the next approved spec (one at a time) from the build step, in a new thread.
- **PR watch** (Claude scheduled task): every 2 hours at :50 Central, fixes failing CI and review comments on agent PRs.
- **Daily digest** (Claude scheduled task): 7:50 PM Central, opens a `digest` issue only on days with auto-merges or shadow-mode `would-auto-merge` labels.

The Claude tasks sit at :20 and :50 so they never share a 15-minute slot with the auto-merge runs at :00 and :30.

## Where things live
| What | Where |
|---|---|
| Settings (login, window, door rules, caps) | `.github/aihero.yaml` |
| House rules and door table | `CLAUDE.md` |
| Review rules | `CODING_STANDARDS.md` |
| Issue and label conventions | `docs/agents/` |
| Domain terms, decisions | `GLOSSARY.md`, `docs/adr/` (created when first needed) |
| Door and merge scripts | `tools/door_gate.py`, `tools/auto_merge.py` |
| Door rule tests | `tests/test_door_gate.py` |
| Matt's skills (vendored) | `.claude/skills/`, source in `VENDORED_FROM.txt` |
