#!/usr/bin/env python3
"""Merge open two-way-door PRs that every gate agrees on.

Gates: label two-way-door, PR body Door two-way, a `door-review: two-way` comment
from cfg.human newer than the last commit, all checks green, inside the merge
window, not frozen. Shadow mode (AUTO_MERGE_ENABLED != true) labels instead.
"""
import datetime
import json
import os
import subprocess
from zoneinfo import ZoneInfo

import yaml

cfg = yaml.safe_load(open(".github/aihero.yaml"))
repo = os.environ["GITHUB_REPOSITORY"]
ENABLED = os.environ.get("ENABLED") == "true"


def gh(*args):
    return subprocess.run(["gh", *args, "--repo", repo], capture_output=True,
                          text=True, check=True).stdout


def summary(line):
    print(line)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as fh:
            fh.write(line + "\n")


def frozen():
    if os.environ.get("MERGE_FREEZE") == "true":
        return "MERGE_FREEZE is on"
    cmd = cfg.get("freeze_command")
    if not cmd:
        return None
    try:  # fail closed
        rc = subprocess.run(cmd, shell=True, timeout=60).returncode
    except Exception as exc:
        return f"freeze check failed: {exc}"
    return f"freeze check exit {rc}" if rc else None


now = datetime.datetime.now(ZoneInfo(cfg["timezone"]))
start, end = cfg.get("merge_window", [0, 24])
freeze = frozen()

prs = json.loads(gh("pr", "list", "--state", "open", "--label", "two-way-door",
                    "--json", "number,body,isDraft,commits,comments,labels"))
for pr in prs:
    n, blockers = pr["number"], []
    if pr["isDraft"]:
        blockers.append("draft")
    if any(l["name"] == "one-way-door" for l in pr["labels"]):
        blockers.append("one-way-door label")
    if "**door:** two-way" not in (pr["body"] or "").lower():
        blockers.append("PR body is not Door: two-way")
    last_commit = max(c["committedDate"] for c in pr["commits"])
    reviews = [c for c in pr["comments"] if c["author"]["login"] == cfg["human"]
               and "door-review:" in c["body"] and c["createdAt"] > last_commit]
    if not reviews:
        blockers.append("no final review since the last commit")
    elif "door-review: two-way" not in reviews[-1]["body"]:
        blockers.append("final review says one-way")
    # gh exits non-zero while checks are pending or failing, so don't use gh()
    out = subprocess.run(["gh", "pr", "checks", str(n), "--repo", repo, "--json", "name,state"],
                         capture_output=True, text=True).stdout
    checks = json.loads(out or "[]")
    if not checks or any(c["state"] not in ("SUCCESS", "SKIPPED") for c in checks):
        blockers.append("checks not all green")
    if not start <= now.hour < end:
        blockers.append(f"outside merge window ({now:%H:%M})")
    if freeze:
        blockers.append(freeze)

    if blockers:
        summary(f"#{n}: waiting ({'; '.join(blockers)})")
    elif ENABLED:
        gh("pr", "merge", str(n), f"--{cfg.get('merge_method', 'squash')}", "--delete-branch")
        summary(f"#{n}: merged (two-way door)")
    else:
        gh("pr", "edit", str(n), "--add-label", "would-auto-merge")
        summary(f"#{n}: shadow mode, would have merged")
