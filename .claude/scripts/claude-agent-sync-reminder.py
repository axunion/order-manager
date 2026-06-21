#!/usr/bin/env python3
"""
PostToolUse hook — remind Claude to keep CLAUDE.md and AGENT.md in sync.

Receives the tool event as JSON on stdin.
When CLAUDE.md or AGENT.md is modified, prints a reminder to stderr.
Always exits 0 (non-blocking).
"""
import json
import os
import sys

event = json.load(sys.stdin)
path = event.get("tool_input", {}).get("file_path", "")
base = os.path.basename(path)

if base == "CLAUDE.md":
    print(
        "File sync reminder: CLAUDE.md was modified.\n"
        "Update AGENT.md with identical content — only the title line (# AGENT.md) differs.\n"
        "Rule: CLAUDE.md §File Sync",
        file=sys.stderr,
    )
elif base == "AGENT.md":
    print(
        "File sync reminder: AGENT.md was modified.\n"
        "Update CLAUDE.md with identical content — only the title line (# CLAUDE.md) differs.\n"
        "Rule: CLAUDE.md §File Sync",
        file=sys.stderr,
    )
