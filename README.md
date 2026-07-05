# CHIRON

**Your agent makes the same mistake every session. CHIRON makes it make each mistake exactly once.**

CHIRON: Corrections Harvested Into Rules, Obeyed Next-session.

Chiron, the immortal centaur of Greek myth, trained Achilles, Asclepius, and Jason. He never fought in the heroes' place; he made the heroes better. CHIRON does the same for your agents: every correction you make becomes a permanent rule, compiled into every agent's memory, recalled in every future session.

## Before / after

**Without CHIRON** (every AI agent user, every week):

> Tuesday: "no, use `py` not `python` on Windows." Agent: "You're right, my mistake."
> Thursday, new session: agent runs `python`. It has no idea Tuesday happened.
> Next month, in Cursor: same mistake. Different agent, same you, same correction, third time.

**With CHIRON:**

```
> chiron add --mistake "ran python on Windows, hit the Store stub" \
    --rule "Use py, not python or python3, on Windows" \
    --how "py -c ... for inline, py script.py for files"
Captured CHI-R007. Compile it into your agents: chiron compile --apply

> chiron compile --apply
WROTE claude:   CLAUDE.md
WROTE agentsmd: AGENTS.md
WROTE cursor:   .cursor/rules/chiron.mdc
WROTE windsurf: .windsurf/rules/chiron.md
```

One correction. Four agents. Every future session. The ledger is git-diffable markdown; run `git diff` and watch the rule land everywhere at once.

## What it does

- **Capture:** a correction becomes a three-line rule (Mistake / Rule / Apply), gated by deterministic dedup and contradiction checks. A repeated lesson bumps a counter instead of duplicating.
- **Compile:** active rules are projected into CLAUDE.md, AGENTS.md, `.cursor/rules/*.mdc` (frontmatter intact), and Windsurf rules (hard caps enforced loudly), inside managed markers. Your own content is never touched. Dry-run by default.
- **Mine:** `chiron mine` sweeps your PAST session transcripts (Claude Code + Codex stores) for corrections you never captured. Read-only, zero LLM, candidates with pointers, never auto-rules.
- **Govern:** duplicates surfaced, contradictions surfaced and ASKED (never auto-resolved), rules seen in 2+ projects proposed for your global ledger, health score 0-100.
- **Archive, never delete:** retired rules land in a dated archive with an append-only changelog. `chiron restore` brings any rule back, forever.
- **Live hook (optional, ships dormant):** the moment you type a correction, the agent gets a one-line nudge to capture it.

## Benchmarks

Reproducible, seeded, no network: `node benchmarks/run.js`

| Suite | Result |
|---|---|
| Ledger round-trip, dedup, contradiction (zero auto-fix asserted) | pass |
| Compiler: surgical markers, idempotent, .mdc frontmatter, Windsurf cap fails loud | pass |
| Mining: planted-correction detection | 6/6 detected, 0 noise hits |
| Promote-to-global: cross-project proposed, single-project not, idempotent | pass |
| Archive/restore round-trip + changelog | pass |
| Hook: nudge on correction, silent on normal prompts, survives garbage stdin | pass |
| **Total** | **34/34** |

Honest limits, measured and admitted: [docs/HONEST-NUMBERS.md](docs/HONEST-NUMBERS.md).

## Install

Windows PowerShell:

```powershell
git clone https://github.com/eragon/chiron.git; cd chiron; npm link
Copy-Item -Recurse skill "$env:USERPROFILE\.claude\skills\chiron"
```

macOS / Linux:

```bash
git clone https://github.com/eragon/chiron.git && cd chiron && npm link
cp -r skill ~/.claude/skills/chiron
```

Then in any project:

```
chiron init      # create the ledger
chiron setup     # state-aware guided setup: what is done, what is missing, why each step matters
```

Zero config works: `init`, `add`, `compile` need nothing else. Everything that writes defaults to dry-run; `--apply` is always explicit. If anything breaks, open your agent in this repo and say: "read CLAUDE.md and set CHIRON up for me."

## The pair

CHIRON is half of a loop:

- **[HORKOS](../horkos)** audits every action NOW: did the work actually land, with evidence?
- **CHIRON** learns from every correction FOREVER: the mistake that slipped through never happens again.

HORKOS catches the failure this time. CHIRON makes sure there is no next time.

## Ecosystem

CHIRON is part of the Demiurge line: mythology-named tools that keep AI agents honest.

| Product | Deity | Job |
|---|---|---|
| VERITAS | Roman goddess of truth | strips AI slop from prose, audits its own rewrite |
| MAAT | Egyptian goddess of order | multi-agent attention terminal with receipts |
| HORKOS | Greek god of oaths | evidence-audit loop: no receipts, no "done" |
| MONETA | Roman goddess of memory and money | token discipline with honest accounting |
| HYPNOS | Greek god of sleep | memory consolidation: every change a diff, nothing deleted |
| CALLIOPE | muse of epic poetry | full design agency in the terminal |
| **CHIRON** | **trainer of heroes** | **corrections become permanent cross-agent rules** |
| SESHAT | Egyptian goddess of records | decision trials with verdicts on the record |

## Star this repo

CHIRON saves you the same correction, typed for the rest of your life. A star costs you one click and tells us to keep building. Fair trade.

MIT. Free, like good teaching should be.
