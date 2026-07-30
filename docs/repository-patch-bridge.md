# Repository Patch Bridge quick start

Use `tools/repo-patch-request.mjs` to generate the exact issue body expected by the bridge.

## Exact replacement

```bash
node tools/repo-patch-request.mjs replace \
  --path a.js \
  --old-file /tmp/old.txt \
  --new-file /tmp/new.txt \
  --message "fix: update auto attack wait" \
  --output /tmp/repo-patch-issue.md
```

The tool resolves the current SHA from `origin/main`, `main`, or `HEAD`, in that order. Override it with `--head`.

## Unified diff

```bash
git diff --binary=false > /tmp/change.diff
node tools/repo-patch-request.mjs diff \
  --patch-file /tmp/change.diff \
  --message "fix: apply reviewed patch" \
  --output /tmp/repo-patch-issue.md
```

Create an issue whose title begins with `[repo-patch]` and paste the generated body. The bridge rejects stale SHAs, unexpected replacement counts, unsafe paths, invalid requests, and validation failures.
