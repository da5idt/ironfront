#!/usr/bin/env python3
"""House rules a script can check. Run by the `checks` job.

ADR 0002: the Simulation and everything that decides a Match (the Computer
Opponent, the Maps) may not read the clock, real randomness or the DOM, or the
same Map, seed and Commands stop giving the same Match.

Comments are blanked by pattern, not by parsing: code after `//` inside a string
on the same line, or after `/*` inside a template literal, is not checked.

Usage: check_house_rules.py [repo-root]. Exits 1 and prints ::error lines on a breach.
"""
import pathlib
import re
import sys

DETERMINISTIC_DIRS = ["src/sim", "src/opponent", "src/game"]
BANNED = {
    "real randomness": r"\bMath\.random\b|\bcrypto\.",
    "the clock": r"\bDate\b|\bperformance\.|\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b",
    "the DOM": r"\bwindow\.|\bdocument\.|\bnavigator\.|\blocalStorage\b",
}
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
LINE_COMMENT = re.compile(r"//.*")


def code_lines(text):
    """Source lines with comments blanked, so a rule may be named in a comment."""
    text = BLOCK_COMMENT.sub(lambda m: "\n" * m.group().count("\n"), text)
    return [LINE_COMMENT.sub("", line) for line in text.splitlines()]


def breaches(root):
    found = []
    for d in DETERMINISTIC_DIRS:
        if not (root / d).is_dir():  # a renamed folder or wrong root must not pass silently
            found.append((pathlib.PurePath(d), 0, "nothing: the folder is missing"))
            continue
        for path in sorted((root / d).rglob("*.ts")):
            if path.name.endswith(".test.ts"):
                continue
            for n, line in enumerate(code_lines(path.read_text()), 1):
                for what, pattern in BANNED.items():
                    if re.search(pattern, line):
                        found.append((path.relative_to(root), n, what))
    return found


if __name__ == "__main__":
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    found = breaches(root)
    for path, n, what in found:
        print(f"::error file={path},line={n}::{path}:{n} reads {what}; ADR 0002 keeps the clock, the DOM and real randomness out of {'/'.join(path.parts[:2])}")
    print(f"house rules: {len(found)} breach(es)")
    sys.exit(1 if found else 0)
