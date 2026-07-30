# Repository Patch Bridge

This workflow gives repository-owner automation a narrow, auditable replacement for a missing partial-file update API.

## Trigger

Create an issue whose title starts with `[repo-patch]`. The issue author/actor must be the repository owner. The body must contain exactly one marked JSON request:

```text
<!-- repo-patch-request:v1 -->
{
  "target_branch": "main",
  "expected_head_sha": "0123456789abcdef0123456789abcdef01234567",
  "commit_message": "fix: update one function",
  "validation": "autoflow",
  "operation": {
    "type": "replace",
    "replacements": [
      {
        "path": "a.js",
        "old": "exact old text",
        "new": "exact new text",
        "expected_count": 1
      }
    ]
  }
}
<!-- /repo-patch-request -->
```

For multi-file patches, use `operation.type = "unified_diff"` and place a standard UTF-8 Git patch in `operation.patch`.

## Guarantees

- The request is rejected unless `expected_head_sha` exactly matches the target branch.
- Exact replacements reject zero matches and unexpected duplicate matches.
- No request-provided shell command is executed.
- Only `none` and `autoflow` validation profiles are accepted.
- Empty changes, binary patches, path traversal, symlinks, and self-modification of the bridge implementation are rejected.
- The issue is closed only after a successful commit and push. Failures leave the issue open with an execution log.
