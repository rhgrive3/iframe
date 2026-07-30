from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / ".github" / "scripts" / "apply_repo_patch.py"
spec = importlib.util.spec_from_file_location("apply_repo_patch", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def request(operation: dict) -> dict:
    return {
        "target_branch": "main",
        "expected_head_sha": "a" * 40,
        "commit_message": "fix: test patch bridge",
        "validation": "none",
        "operation": operation,
    }


class RepoPatchBridgeTests(unittest.TestCase):
    def test_extracts_and_validates_marked_json(self):
        payload = request(
            {
                "type": "replace",
                "replacements": [
                    {"path": "a.js", "old": "old", "new": "new", "expected_count": 1}
                ],
            }
        )
        body = (
            "prefix\n"
            f"{module.START_MARKER}\n"
            f"{json.dumps(payload)}\n"
            f"{module.END_MARKER}\n"
        )
        parsed = module.extract_request_json(body)
        self.assertEqual(parsed["target_branch"], "main")
        self.assertEqual(parsed["operation"]["type"], "replace")

    def test_rejects_stale_or_missing_sha_shape(self):
        payload = request({"type": "unified_diff", "patch": "diff --git a/a b/a\n"})
        payload["expected_head_sha"] = "abc"
        with self.assertRaises(module.RequestError):
            module.validate_request(payload)

    def test_exact_replace_requires_expected_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.js").write_text("x\nx\n", encoding="utf-8")
            payload = request(
                {
                    "type": "replace",
                    "replacements": [
                        {"path": "a.js", "old": "x", "new": "y", "expected_count": 1}
                    ],
                }
            )
            normalized = module.validate_request(payload)
            with self.assertRaises(module.RequestError):
                module.apply_request(normalized, root)
            self.assertEqual((root / "a.js").read_text(encoding="utf-8"), "x\nx\n")

    def test_exact_replace_applies_multiple_ordered_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.js").write_text("alpha beta\n", encoding="utf-8")
            payload = request(
                {
                    "type": "replace",
                    "replacements": [
                        {"path": "a.js", "old": "alpha", "new": "one", "expected_count": 1},
                        {"path": "a.js", "old": "beta", "new": "two", "expected_count": 1},
                    ],
                }
            )
            touched = module.apply_request(module.validate_request(payload), root)
            self.assertEqual(touched, ["a.js"])
            self.assertEqual((root / "a.js").read_text(encoding="utf-8"), "one two\n")

    def test_bridge_files_are_protected(self):
        payload = request(
            {
                "type": "replace",
                "replacements": [
                    {
                        "path": ".github/workflows/repo-patch-bridge.yml",
                        "old": "a",
                        "new": "b",
                        "expected_count": 1,
                    }
                ],
            }
        )
        with self.assertRaises(module.RequestError):
            module.validate_request(payload)

    def test_unified_diff_applies_in_git_worktree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
            (root / "a.txt").write_text("old\n", encoding="utf-8")
            subprocess.run(["git", "add", "a.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "initial"], cwd=root, check=True)
            patch = (
                "diff --git a/a.txt b/a.txt\n"
                "index 3367afd..3e75765 100644\n"
                "--- a/a.txt\n"
                "+++ b/a.txt\n"
                "@@ -1 +1 @@\n"
                "-old\n"
                "+new\n"
            )
            payload = request({"type": "unified_diff", "patch": patch})
            touched = module.apply_request(module.validate_request(payload), root)
            self.assertEqual(touched, ["a.txt"])
            self.assertEqual((root / "a.txt").read_text(encoding="utf-8"), "new\n")


if __name__ == "__main__":
    unittest.main()
