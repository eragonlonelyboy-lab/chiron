---
name: chiron
description: Use when the user corrects the agent (wrong output, wrong approach, "no, I said...", "that's wrong", "you forgot..."), when the user asks to capture a lesson or rule ("/chiron", "capture that", "remember this rule", "never do that again"), when reviewing mined correction candidates from `chiron mine`, or at session end to sweep for uncaptured corrections. CHIRON turns corrections into permanent rules compiled into every agent's memory (CLAUDE.md, AGENTS.md, Cursor, Windsurf) so the same mistake never happens twice.
argument-hint: "[capture | review-mine | sweep] or just describe the correction"
---

# CHIRON: Corrections Harvested Into Rules, Obeyed Next-session

Chiron, the immortal centaur, trained Achilles, Asclepius, and Jason. He did not fight for the heroes; he made the heroes better. CHIRON does the same for your agents: every correction becomes a permanent rule, recalled in every future session, in every agent you use.

The cycle: **correction → rule → permanent recall.**

## When you are invoked

**Mode A, capture (default):** a correction just happened, or the user says "capture that."
**Mode B, review-mine:** the user ran `chiron mine` and wants candidates distilled.
**Mode C, sweep:** session is ending; check whether any correction this session went uncaptured.

## Mode A: Capture

1. **Identify the correction, then verify the diagnosis before distilling.** What did the agent do, and what did the user actually want? If it is ambiguous which of two things was the mistake, ask one short question, never guess. Then investigate *why* it happened and confirm the real cause before harvesting a rule: a rule distilled from a misdiagnosed or surface-level correction is worse than none, because it becomes permanent. Correction → **verified cause** → rule.
2. **Distill it into the rule format.** Three parts, each one sentence, durable and general enough to prevent the CLASS of mistake, specific enough to be actionable:
   - **Mistake:** what went wrong (past tense, factual)
   - **Rule:** the instruction that would have prevented it (imperative)
   - **Apply:** how to follow it in practice (the check, the command, the habit)
   Bad rule: "be more careful with files." Good rule: "Validate canvas JSON with a parser after every write; unescaped quotes break Obsidian."
   Two optional fields carry the richer context a one-line rule cannot:
   - **Detail** (`--detail`): a multi-line technical note (the failure scenario, code specifics, the fix). This is what a running lessons journal holds; put it here instead of losing it.
   - **type** (`--type gotcha`): mark a technical discovery you hit yourself (not a user correction) as a `gotcha`. Corrections (the default) compile into every agent file; `gotcha` entries stay in the ledger as the searchable technical journal and never bloat the agent files. Use `gotcha` for API quirks, environment traps, and hard-won findings; use the default for behavioral rules the agent must obey.
   - **Failure-class tag** (in `--source`): when the mistake maps to a working-discipline stage, append `class:<scope|evidence|adversarial|verify|report>` to the source string (e.g. `--source "session 2026-07-10 class:verify"`). Counting classes across the ledger turns it into a defect map: the class that accumulates the most rules is the habit to harden next. Tag honestly; skip it when none fits.
3. **Gate it through the CLI** (dedup + contradiction checks are deterministic, let them run):
   ```
   chiron add --mistake "..." --rule "..." --how "..." --detail "..." --type gotcha --source "session YYYY-MM-DD"
   ```
   (`--detail` and `--type` are optional; omit them for a plain behavioral correction.)
   - **Exit 2 (duplicate):** the CLI names the existing rule. Bump it instead: `chiron bump <id>`. A repeated lesson is a signal, not a new rule.
   - **Exit 3 (contradiction):** the CLI names the conflicting rule. NEVER pick a winner yourself. Show the user both rules and ask which stands; archive the loser with `chiron archive <id> --reason "superseded by <new>"`.
4. **Compile:** `chiron compile --apply` so every agent file gets the rule now, not someday.
5. **Confirm with receipts:** show the rule id, and the list of files the compiler wrote.

## Mode B: Review mined candidates

`chiron mine` output is heuristic: candidates, not truth. For each candidate the user wants processed:
1. Read the excerpt (and the transcript pointer if more context is needed).
2. Decide honestly: was this a real correction with a durable lesson, or noise (a one-off preference, a misunderstanding, an already-captured rule)? Say which and why in one line.
3. Real ones go through Mode A steps 2-5. Skip the rest, tell the user what was skipped.

## Mode C: Session sweep

Scan the current session for moments the user corrected you. For each one not yet captured, propose the distilled rule (Mode A format) and ask in ONE batch which to capture. Capture approved ones through Mode A steps 3-5.

## Laws (non-negotiable)

### Project-earned rules and vindicated dissent

- A project template may carry `[RESEED]` rules, but the marker stays until a real incident from that project supplies positive and negative evidence.
- A rejected or parked reviewer finding is not a correction yet. Store it as dissent linked to the decision and its tripwires, not as an active rule.
- When a tripwire fires or later evidence vindicates the finding, resurface it for review. Do not silently activate it and do not erase the original rejection reason.
- Compile only confirmed corrections into agent instructions. Agreement between multiple models is not confirmation.

- **The CLI gates every write.** Never write to the ledger file directly; `chiron add` runs the dedup and contradiction checks you cannot do reliably by eye.
- **Contradictions are asked, never picked.** CHIRON's trust model is the user's memory stays the user's.
- **Archive, never delete.** Retiring a rule goes through `chiron archive`; it is restorable forever.
- **A rule must name the class, not the instance.** "Do not call the API twice on THIS page" is an instance; "Re-fetch before every full-page overwrite" is a class.
- **Receipts on every capture:** rule id + compiled files, shown to the user.
- **Sibling note:** if HORKOS is installed, its audit failures are prime capture material; offer to distill repeated audit findings into rules.
