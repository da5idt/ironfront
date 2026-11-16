"""check_house_rules.py against small throwaway trees, plus the real repo."""
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "tools/check_house_rules.py"


def check(root):
    return subprocess.run([sys.executable, SCRIPT, root], capture_output=True, text=True)


class HouseRules(unittest.TestCase):
    def tree(self, files):
        d = pathlib.Path(tempfile.mkdtemp())
        for folder in ("src/sim", "src/opponent", "src/game"):
            (d / folder).mkdir(parents=True)
        for name, text in files.items():
            (d / name).parent.mkdir(parents=True, exist_ok=True)
            (d / name).write_text(text)
        return d

    def test_this_repo_passes(self):
        r = check(ROOT)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_real_randomness_in_the_simulation_fails(self):
        r = check(self.tree({"src/sim/combat.ts": "const roll = Math.random();\n"}))
        self.assertEqual(r.returncode, 1)
        self.assertIn("::error file=src/sim/combat.ts,line=1::", r.stdout)

    def test_the_clock_in_the_opponent_fails(self):
        r = check(self.tree({"src/opponent/think.ts": "\n\nconst t = Date.now();\n"}))
        self.assertEqual(r.returncode, 1)
        self.assertIn("line=3", r.stdout)

    def test_the_dom_in_a_map_fails(self):
        r = check(self.tree({"src/game/maps/a.ts": "window.alert('x');\n"}))
        self.assertEqual(r.returncode, 1)

    def test_a_missing_folder_fails(self):
        r = check(tempfile.mkdtemp())
        self.assertEqual(r.returncode, 1)
        self.assertIn("src/sim", r.stdout)

    def test_naming_a_rule_in_a_comment_passes(self):
        r = check(self.tree({"src/sim/rng.ts": "// never call Math.random\n/* nor\n Date.now() */\nexport const x = 1;\n"}))
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_tests_and_the_client_are_left_alone(self):
        r = check(self.tree({
            "src/sim/a.test.ts": "const t = Date.now();\n",
            "src/client/main.ts": "const t = performance.now();\n",
        }))
        self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main()
