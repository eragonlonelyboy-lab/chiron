# CHIRON companion guide (for AI agents helping a human set up or use CHIRON)

You are reading this because a human opened their agent in the CHIRON repo and asked for help. Walk them through ONE step at a time. Explain before doing. Never pressure an optional step.

## What CHIRON is (tell them in one line)

Every correction they make to an agent becomes a permanent rule, compiled into every agent's memory file, so the same mistake never happens twice.

## Setup, conversationally

1. **Check state first:** run `chiron setup` in their project and read the output to them in plain language. It detects what is done and what is missing and changes nothing.
2. **If no ledger:** explain that the ledger (`.chiron/ledger.md`) is where rules live, git-diffable. Then run `chiron init`.
3. **First rule:** ask if there is a correction they keep repeating to their agents. Distill it with them into Mistake / Rule / Apply (one sentence each), then run `chiron add`. If the CLI reports a duplicate or contradiction, show them what it said; the gates exist to keep their rule set clean.
4. **Compile:** explain that rules only work when agents read them at session start. Show the dry-run first (`chiron compile`), let them see the plan, then `chiron compile --apply`. Their own file content outside the managed markers is never touched.
5. **Optional, live hook:** explain honestly: it reads each prompt locally, and when a prompt looks like a correction it adds one line of context nudging the agent to capture the rule; it never blocks and sends nothing anywhere. If they want it, add to `~/.claude/settings.json` under `hooks.UserPromptSubmit`: `node <repo>/hooks/chiron-hook.js`. If they decline, they lose nothing except automation; `/chiron capture` and `chiron mine` still work.
6. **Optional, mine history:** `chiron mine` sweeps their past transcripts read-only for corrections they already paid for and never captured. Offer to review the candidates with them (skill Mode B). Expect false positives; discard freely.
7. **Skill install (if not done):** copy `skill/` to `~/.claude/skills/chiron` so capture works conversationally.

## Story, not setup

The author wires CHIRON into a broader discipline stack (HORKOS audits actions, HYPNOS consolidates memory). That is how WE use it; none of it is required. CHIRON alone is complete.

## Day-to-day use (tell them once)

- They correct their agent -> agent offers to capture (hook) or they say "capture that" (skill).
- `chiron check` any time: health, duplicates, contradictions, drift.
- `chiron promote` when a rule proves itself across projects.
- Retire with `chiron archive <id>`; nothing is ever deleted, `chiron restore` brings rules back.

<!-- chiron:begin (managed by CHIRON, do not edit inside) -->
## Rules learned from corrections (CHIRON)

- **CHI-R001:** When writing a banned-character lint, spell the banned characters as backslash-u escape sequences in the lint source so it never matches itself
<!-- chiron:end -->
