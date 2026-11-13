"""door_gate.py against the door table in .github/aihero.yaml.

Each case builds a throwaway git repo holding this repo's aihero.yaml, commits a
change on top, and runs the real script, so the rules are tested as CI runs them.
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
TWO_WAY_BODY = "**Door:** two-way"


def run(cwd, *args, **kw):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True, **kw).stdout


class DoorGate(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        d = self.dir
        run(d, "git", "init", "-q", "-b", "main")
        run(d, "git", "config", "user.email", "t@example.com")
        run(d, "git", "config", "user.name", "t")
        os.makedirs(f"{d}/.github")
        shutil.copy(ROOT / ".github/aihero.yaml", f"{d}/.github/aihero.yaml")
        self.write("src/game.ts", "export const speed = 1;\n")
        run(d, "git", "add", "-A")
        run(d, "git", "commit", "-qm", "base")
        self.base = run(d, "git", "rev-parse", "HEAD").strip()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def write(self, path, text):
        p = pathlib.Path(self.dir, path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def door(self, body=TWO_WAY_BODY):
        run(self.dir, "git", "add", "-A")
        run(self.dir, "git", "commit", "-qm", "change")
        env = {**os.environ, "PR_BODY": body}
        env.pop("GITHUB_OUTPUT", None)
        out = run(self.dir, sys.executable, str(ROOT / "tools/door_gate.py"), self.base, "HEAD", env=env)
        return out.splitlines()[0].split(": ")[1]

    def test_gameplay_tweak_is_two_way(self):
        self.write("src/game.ts", "export const speed = 2;\n")
        self.assertEqual(self.door(), "two-way")

    def test_body_saying_one_way_wins(self):
        self.write("src/game.ts", "export const speed = 2;\n")
        self.assertEqual(self.door("**Door:** one-way"), "one-way")

    def test_missing_door_line_is_one_way(self):
        self.write("src/game.ts", "export const speed = 2;\n")
        self.assertEqual(self.door("no door here"), "one-way")

    def test_deletion_is_one_way(self):
        os.remove(f"{self.dir}/src/game.ts")
        self.write("src/other.ts", "x\n")
        self.assertEqual(self.door(), "one-way")

    def test_one_way_paths(self):
        for path in [".github/workflows/x.yaml", "tools/x.py", ".claude/skills/x/SKILL.md",
                     "CLAUDE.md", "package.json", "web/package-lock.json", "vite.config.ts",
                     "src/save/format.ts", "assets/tank.png", "src/ui/click.wav", "LICENSE",
                     "README.md", "docs/workflow.md"]:
            with self.subTest(path=path):
                self.tearDown()  # fresh repo per path, so one match can't hide another
                self.setUp()
                self.write(path, "x\n")
                self.assertEqual(self.door(), "one-way")

    def test_network_code_is_one_way(self):
        self.write("src/net.ts", "await fetch('https://example.com');\n")
        self.assertEqual(self.door(), "one-way")


if __name__ == "__main__":
    unittest.main()
