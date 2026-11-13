#!/usr/bin/env python3
"""Classify a PR as a one-way or two-way door. Strictest signal wins.

Usage: door_gate.py <base-sha> <head-sha>  (PR body in $PR_BODY; rules in .github/aihero.yaml)
Prints the door and reasons; writes door=<one-way|two-way> to $GITHUB_OUTPUT.
"""
import os
import re
import subprocess
import sys

import yaml

cfg = yaml.safe_load(open(".github/aihero.yaml"))
base, head = sys.argv[1], sys.argv[2]


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


reasons = []
for line in git("diff", "--name-status", f"{base}...{head}").splitlines():
    status, *paths = line.split("\t")
    if status.startswith("D"):
        reasons.append(f"deletes {paths[0]}")
    for p in paths:
        if any(re.search(pat, p) for pat in cfg.get("one_way_paths") or []):
            reasons.append(f"touches {p}")

diff = [l for l in git("diff", "-U0", f"{base}...{head}").splitlines()
        if l[:1] in ("+", "-") and not l.startswith(("+++", "---"))]
changed = "\n".join(l[1:] for l in diff)
for name, pat in (cfg.get("one_way_content") or {}).items():
    if re.search(pat, changed, re.IGNORECASE):
        reasons.append(f"changes {name}")
if cfg.get("removed_id_pattern"):
    rid = re.compile(cfg["removed_id_pattern"])
    added = {m.group(1) for l in diff if l[0] == "+" and (m := rid.search(l[1:]))}
    for l in diff:
        if l[0] == "-" and (m := rid.search(l[1:])) and m.group(1) not in added:
            reasons.append(f"removes {m.group(1)}")

m = re.search(r"\*\*Door:\*\*\s*(one-way|two-way)", os.environ.get("PR_BODY", ""), re.IGNORECASE)
if not m:
    reasons.append("PR body has no **Door:** line")
elif m.group(1).lower() == "one-way":
    reasons.append("PR body says one-way")

door = "one-way" if reasons else "two-way"
print(f"door: {door}")
for r in dict.fromkeys(reasons):
    print(f"  - {r}")
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
        fh.write(f"door={door}\n")
