#!/usr/bin/env python3
"""Parse and apply owner-authorized repository patch requests.

The request is transported through a GitHub issue body. This script deliberately
supports data-only operations; it never executes commands supplied by the issue.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

START_MARKER = "<!-- repo-patch-request:v1 -->"
END_MARKER = "<!-- /repo-patch-request -->"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
BRANCH_RE = re.compile(r"^(?!/)(?!.*(?:\.\.|//|@\{|\\))(?!.*\.lock$)[A-Za-z0-9._/-]{1,200}(?<!/)$")
ALLOWED_VALIDATIONS = {"none", "autoflow"}
ALLOWED_OPERATIONS = {"replace", "unified_diff"}
MAX_REQUEST_BYTES = 64 * 1024
MAX_REPLACEMENTS = 25
MAX_TEXT_BYTES = 512 * 1024
PROTECTED_PATHS = {
    ".github/workflows/repo-patch-bridge.yml",
    ".github/scripts/apply_repo_patch.py",
}


class RequestError(ValueError):
    """Raised when a patch request is malformed or unsafe."""


def fail(message: str) -> "NoReturn":
    raise RequestError(message)


def extract_request_json(issue_body: str) -> dict[str, Any]:
    encoded = issue_body.encode("utf-8")
    if len(encoded) > MAX_REQUEST_BYTES:
        fail(f"request body exceeds {MAX_REQUEST_BYTES} bytes")

    start = issue_body.find(START_MARKER)
    end = issue_body.find(END_MARKER)
    if start < 0 or end < 0 or end <= start:
        fail("repo patch request markers are missing or out of order")
    if issue_body.find(START_MARKER, start + len(START_MARKER)) >= 0:
        fail("multiple repo patch request blocks are not allowed")

    payload = issue_body[start + len(START_MARKER) : end].strip()
    if not payload:
        fail("request payload is empty")
    try:
        value = json.loads(payload)
    except json.JSONDecodeError as exc:
        fail(f"request payload is not valid JSON: {exc}")
    if not isinstance(value, dict):
        fail("request payload must be a JSON object")
    return validate_request(value)


def validate_request(value: dict[str, Any]) -> dict[str, Any]:
    allowed_top = {
        "target_branch",
        "expected_head_sha",
        "commit_message",
        "validation",
        "operation",
    }
    unknown = sorted(set(value) - allowed_top)
    if unknown:
        fail(f"unknown top-level fields: {', '.join(unknown)}")

    branch = value.get("target_branch")
    if not isinstance(branch, str) or not BRANCH_RE.fullmatch(branch):
        fail("target_branch is missing or invalid")

    expected_sha = value.get("expected_head_sha")
    if not isinstance(expected_sha, str) or not SHA_RE.fullmatch(expected_sha):
        fail("expected_head_sha must be a lowercase 40-character commit SHA")

    message = value.get("commit_message")
    if not isinstance(message, str) or not message.strip():
        fail("commit_message is required")
    if "\n" in message or "\r" in message or len(message) > 200:
        fail("commit_message must be one line and at most 200 characters")

    validation = value.get("validation", "none")
    if validation not in ALLOWED_VALIDATIONS:
        fail(f"validation must be one of: {', '.join(sorted(ALLOWED_VALIDATIONS))}")

    operation = value.get("operation")
    if not isinstance(operation, dict):
        fail("operation must be a JSON object")
    operation_type = operation.get("type")
    if operation_type not in ALLOWED_OPERATIONS:
        fail(f"operation.type must be one of: {', '.join(sorted(ALLOWED_OPERATIONS))}")

    if operation_type == "replace":
        normalized_operation = validate_replace_operation(operation)
    else:
        normalized_operation = validate_unified_diff_operation(operation)

    return {
        "target_branch": branch,
        "expected_head_sha": expected_sha,
        "commit_message": message.strip(),
        "validation": validation,
        "operation": normalized_operation,
    }


def validate_replace_operation(operation: dict[str, Any]) -> dict[str, Any]:
    unknown = sorted(set(operation) - {"type", "replacements"})
    if unknown:
        fail(f"unknown replace fields: {', '.join(unknown)}")
    replacements = operation.get("replacements")
    if not isinstance(replacements, list) or not replacements:
        fail("replace operation requires a non-empty replacements array")
    if len(replacements) > MAX_REPLACEMENTS:
        fail(f"replace operation supports at most {MAX_REPLACEMENTS} replacements")

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(replacements):
        if not isinstance(item, dict):
            fail(f"replacement {index} must be an object")
        unknown_item = sorted(set(item) - {"path", "old", "new", "expected_count"})
        if unknown_item:
            fail(f"replacement {index} has unknown fields: {', '.join(unknown_item)}")
        path = validate_repo_path(item.get("path"), f"replacement {index} path")
        old = item.get("old")
        new = item.get("new")
        count = item.get("expected_count", 1)
        if not isinstance(old, str) or not old:
            fail(f"replacement {index} old text must be non-empty")
        if not isinstance(new, str):
            fail(f"replacement {index} new text must be a string")
        if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 100:
            fail(f"replacement {index} expected_count must be an integer from 1 to 100")
        if len(old.encode("utf-8")) > MAX_TEXT_BYTES or len(new.encode("utf-8")) > MAX_TEXT_BYTES:
            fail(f"replacement {index} text exceeds {MAX_TEXT_BYTES} bytes")
        normalized.append({"path": path, "old": old, "new": new, "expected_count": count})

    return {"type": "replace", "replacements": normalized}


def validate_unified_diff_operation(operation: dict[str, Any]) -> dict[str, Any]:
    unknown = sorted(set(operation) - {"type", "patch"})
    if unknown:
        fail(f"unknown unified_diff fields: {', '.join(unknown)}")
    patch = operation.get("patch")
    if not isinstance(patch, str) or not patch.strip():
        fail("unified_diff operation requires a non-empty patch")
    if "\x00" in patch:
        fail("patch must not contain NUL bytes")
    if len(patch.encode("utf-8")) > MAX_TEXT_BYTES:
        fail(f"patch exceeds {MAX_TEXT_BYTES} bytes")
    if "GIT binary patch" in patch or "Binary files " in patch:
        fail("binary patches are not supported")
    return {"type": "unified_diff", "patch": patch}


def validate_repo_path(value: Any, label: str = "path") -> str:
    if not isinstance(value, str) or not value:
        fail(f"{label} is required")
    if "\x00" in value or "\\" in value:
        fail(f"{label} contains an unsafe character")
    path = Path(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        fail(f"{label} must be a normalized repository-relative path")
    normalized = path.as_posix()
    if normalized in PROTECTED_PATHS:
        fail(f"{label} is protected from self-modification: {normalized}")
    return normalized


def safe_file(repo_root: Path, relative: str) -> Path:
    candidate = repo_root / relative
    if candidate.is_symlink():
        fail(f"refusing to modify symlink: {relative}")
    resolved_root = repo_root.resolve()
    resolved = candidate.resolve(strict=False)
    try:
        resolved.relative_to(resolved_root)
    except ValueError:
        fail(f"path escapes repository root: {relative}")
    return candidate


def apply_request(request: dict[str, Any], repo_root: Path) -> list[str]:
    repo_root = repo_root.resolve()
    operation = request["operation"]
    if operation["type"] == "replace":
        touched = apply_replacements(operation["replacements"], repo_root)
    else:
        touched = apply_unified_diff(operation["patch"], repo_root)

    if not touched:
        fail("operation produced no changed files")
    protected = sorted(set(touched) & PROTECTED_PATHS)
    if protected:
        fail(f"operation attempted to modify protected bridge files: {', '.join(protected)}")
    return sorted(set(touched))


def apply_replacements(replacements: list[dict[str, Any]], repo_root: Path) -> list[str]:
    pending: dict[str, str] = {}
    original: dict[str, str] = {}

    for item in replacements:
        relative = item["path"]
        path = safe_file(repo_root, relative)
        if relative not in pending:
            if not path.is_file():
                fail(f"replacement target is not a regular file: {relative}")
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                fail(f"replacement target is not UTF-8 text: {relative}")
            pending[relative] = text
            original[relative] = text

        current = pending[relative]
        actual_count = current.count(item["old"])
        expected_count = item["expected_count"]
        if actual_count != expected_count:
            fail(
                f"replacement count mismatch for {relative}: "
                f"expected {expected_count}, found {actual_count}"
            )
        pending[relative] = current.replace(item["old"], item["new"], expected_count)

    touched: list[str] = []
    for relative, text in pending.items():
        if text == original[relative]:
            continue
        path = safe_file(repo_root, relative)
        path.write_text(text, encoding="utf-8")
        touched.append(relative)
    return touched


def apply_unified_diff(patch: str, repo_root: Path) -> list[str]:
    patch_path = repo_root / ".git" / "repo-patch-request.diff"
    patch_path.write_text(patch, encoding="utf-8")
    try:
        run_git(repo_root, "apply", "--check", str(patch_path))
        run_git(repo_root, "apply", str(patch_path))
    finally:
        patch_path.unlink(missing_ok=True)

    output = run_git(repo_root, "diff", "--name-only", "--no-renames", capture=True)
    touched = [line for line in output.splitlines() if line]
    for relative in touched:
        validate_repo_path(relative, "patched path")
    return touched


def run_git(repo_root: Path, *args: str, capture: bool = False) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        check=False,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "git command failed").strip()
        fail(f"git {' '.join(args)} failed: {detail}")
    return completed.stdout if capture else ""


def write_github_output(path: Path, request: dict[str, Any]) -> None:
    values = {
        "target_branch": request["target_branch"],
        "expected_head_sha": request["expected_head_sha"],
        "commit_message": request["commit_message"],
        "validation": request["validation"],
    }
    with path.open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def command_parse(args: argparse.Namespace) -> None:
    issue_body = Path(args.body_file).read_text(encoding="utf-8")
    request = extract_request_json(issue_body)
    Path(args.request_file).write_text(
        json.dumps(request, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    if args.github_output:
        write_github_output(Path(args.github_output), request)


def command_apply(args: argparse.Namespace) -> None:
    request = json.loads(Path(args.request_file).read_text(encoding="utf-8"))
    request = validate_request(request)
    touched = apply_request(request, Path(args.repo_root))
    print("Changed files:")
    for path in touched:
        print(f"- {path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse")
    parse_parser.add_argument("--body-file", required=True)
    parse_parser.add_argument("--request-file", required=True)
    parse_parser.add_argument("--github-output")
    parse_parser.set_defaults(func=command_parse)

    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--request-file", required=True)
    apply_parser.add_argument("--repo-root", required=True)
    apply_parser.set_defaults(func=command_apply)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except RequestError as exc:
        print(f"repo-patch error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
