# Ironfront

A personal, original real-time strategy game (base building, resource gathering, unit control) in the spirit of 1990s RTS games. It is not a recreation of any existing game: no names, characters, art, music, maps or text from one. No game code exists yet; the first game spec picks the stack and adds its CI checks.

## Agent skills

### Issue tracker

GitHub Issues on `da5idt/ironfront` (use `gh api` REST; GraphQL is blocked in cloud sessions). See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage labels plus the aihero workflow labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root, created lazily. See `docs/agents/domain.md`.

Matt Pocock's skills are vendored in `.claude/skills/` (source and update steps in `VENDORED_FROM.txt`). Skills marked user-invoked only are run by reading `.claude/skills/<name>/SKILL.md` and following it.

## Agent workflow (aihero)
How it works, with a diagram: `docs/workflow.md`. Update it in any PR that changes the workflow.
- Plan by size: /grill-me (small), /grill-with-docs (medium), /wayfinder (large); then /to-spec and /to-tickets. da5idt approves tickets with `ready-for-agent`.
- Build with /implement-spec (caps in `.github/aihero.yaml`). /code-review the branch, fix, open the PR with /pr.
- A fresh thread runs the final /code-review and comments `door-review: two-way` or `door-review: one-way`.
- Agents never merge. Two-way doors auto-merge at any hour; da5idt merges one-way doors.
- /retro after each spec; retro PRs are always one-way.

## Door table (strictest of PR body, final review, and `tools/door_gate.py` wins)
- **Two-way:** new gameplay features, units, buildings and AI behavior; balance and parameter tweaks; bug fixes, tests and refactors inside the game code; docs other than the rules files below.
- **One-way:** CI and GitHub Actions, door rules (`.github/aihero.yaml`, `tools/`), `CLAUDE.md`, `CODING_STANDARDS.md`, `docs/agents/`, `docs/workflow.md`, the vendored skills; deleting any file; dependency and lockfile changes; build and deploy config; save-game and map file formats; anything that sends data off the player's machine (network, analytics, telemetry); `LICENSE`, `README.md`, and third-party assets (art, sound, fonts).
