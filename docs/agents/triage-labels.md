# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## aihero workflow labels

These labels sit beside the triage roles. Only the workflow and `door-gate` apply them.

| Label              | Meaning                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `spec`             | The issue is a spec; its tickets are sub-issues                         |
| `in-progress`      | An agent has claimed this ticket                                        |
| `one-way-door`     | PR needs da5idt to merge (set by `door-gate`)                           |
| `two-way-door`     | PR may auto-merge once every gate passes (set by `door-gate`)           |
| `would-auto-merge` | Shadow mode: this PR would have auto-merged                             |
| `digest`           | Daily list of auto-merged PRs                                           |
