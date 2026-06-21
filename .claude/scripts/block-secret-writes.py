#!/usr/bin/env python3
"""
PreToolUse hook — block writes to secret / credential files.

Receives the tool event as JSON on stdin.
Exits 2 (blocking) when file_path matches a secret pattern.
Exits 0 (allow) otherwise.

Patterns blocked:
  *.key, *.pem, *.p12, *.pfx  — also covered by sandbox denyOnly; kept for defense-in-depth
  (^|/)credentials             — files whose name starts with "credentials" (e.g. credentials.json)
  (^|/)\.env(?!\.example)      — .env and .env.* variants; .env.example (template) is allowed
"""
import json
import re
import sys

event = json.load(sys.stdin)
path = event.get("tool_input", {}).get("file_path", "")

SECRET_PATTERNS = [
    r"\.key$",
    r"\.pem$",
    r"\.p12$",
    r"\.pfx$",
    r"(^|/)credentials",
    r"(^|/)\.env(?!\.example)",
]

for pattern in SECRET_PATTERNS:
    if re.search(pattern, path):
        print(
            f"BLOCKED: Writing to a secret/credential file is not allowed: {path}\n"
            "Commit secrets are prohibited by CLAUDE.md. "
            "Use environment variables or Cloudflare secrets instead.",
            file=sys.stderr,
        )
        sys.exit(2)
