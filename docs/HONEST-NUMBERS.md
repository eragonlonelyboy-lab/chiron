# HONEST-NUMBERS: when CHIRON loses

Every Demiurge product tells you where it does NOT win. Here is CHIRON's list.

## Mining is heuristic, and we measured it

`chiron mine` finds corrections with deterministic text patterns, zero LLM. On the seeded benchmark corpus (6 planted corrections + 4 noise turns, in `benchmarks/run.js`, reproducible): 6/6 planted detected, 0 noise hits. Real transcripts are messier than any fixture: expect FALSE POSITIVES (a "no," that opens a clarification, not a correction) and misses (corrections phrased gently). That is why mine outputs candidates for review, never auto-rules. Run it expecting to discard some of what it finds.

## Distillation is judgment, not measurement

Turning a correction into a well-worded rule is LLM work (the skill layer). No benchmark can bless judgment; what IS checkable are the receipts: every capture shows the rule id and the exact files compiled, the ledger is git-diffable markdown, and every change lands in an append-only changelog. Trust the trail, not the claim.

## If you live in one agent and never leave, you get less

The headline is cross-agent: one correction compiled into CLAUDE.md, AGENTS.md, Cursor, and Windsurf at once. If you use Claude Code only, Anthropic's native auto-memory already captures casual corrections for you, and CHIRON's remaining value narrows to governance: dedup, contradiction surfacing, promote-to-global, archive-not-delete, and the mining sweep. Real, but a smaller win.

## Rules compete for context

Every compiled rule costs context tokens in every future session. A 200-rule ledger is a liability, not an asset. CHIRON's health check flags staleness and duplicates, and the Windsurf compiler enforces the platform's hard caps loudly, but the discipline of keeping rules FEW and SHARP is yours. Archive freely; nothing is ever lost.

## What CHIRON does not do

- It does not stop the mistake happening the FIRST time. That is HORKOS's job (evidence-audit of every action). CHIRON stops the second time.
- It does not consolidate or reorganize your broader memory files. That is HYPNOS's job. CHIRON owns one pipeline: correction to rule.
- It does not sync rules across machines or teams. v1 is local-first, single user.
