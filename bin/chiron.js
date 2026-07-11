#!/usr/bin/env node
// CHIRON: Corrections Harvested Into Rules, Obeyed Next-session.
// The centaur who trained the heroes now trains your agents.
'use strict';
const fs = require('fs');
const path = require('path');
const ledger = require('../lib/ledger');
const governance = require('../lib/governance');
const compiler = require('../lib/compiler');
const archive = require('../lib/archive');
const miner = require('../lib/mine');
const siblings = require('../lib/siblings');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = new Set(argv.filter(a => a.startsWith('--')));
const root = process.cwd();
const APPLY = flags.has('--apply');

function out(s) { process.stdout.write(s + '\n'); }
function json(o) { out(JSON.stringify(o, null, 2)); }
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
function ledgerPathFor() {
  return flags.has('--global') ? ledger.globalLedgerPath() : ledger.projectLedgerPath(root);
}

const commands = {
  init() {
    const p = ledger.projectLedgerPath(root);
    if (fs.existsSync(p)) { out(`ledger already exists: ${p}`); return; }
    ledger.save(p, []);
    ledger.registerProject(root);
    out(`CHIRON ledger created: ${p}`);
    out('Next: capture your first rule with "chiron add", or sweep history with "chiron mine".');
  },

  // Deterministic add (the skill calls this after distilling a correction).
  add() {
    const p = ledgerPathFor();
    const rules = ledger.load(p);
    const rule = {
      id: ledger.nextId(rules),
      status: 'active',
      created: new Date().toISOString().slice(0, 10),
      mistake: arg('--mistake', ''),
      rule: arg('--rule', ''),
      apply: arg('--how', ''),
      detail: arg('--detail', ''),
      type: ['gotcha', 'dissent'].includes(arg('--type', 'correction')) ? arg('--type', 'correction') : 'correction',
      source: arg('--source', 'manual'),
      projects: [path.basename(root)],
      occurrences: 1,
      updated: new Date().toISOString().slice(0, 10),
    };
    if (!rule.rule) { out('ERROR: --rule is required (the durable rule text).'); process.exit(1); }
    // dedup gate: refuse silently duplicating; surface the match instead
    const dupe = rules.find(r => r.status === 'active' && ledger.isDuplicate(r, rule));
    if (dupe && !flags.has('--force')) {
      out(`DUPLICATE of ${dupe.id}: "${dupe.rule}"`);
      out(`If it truly is the same lesson, bump it instead: chiron bump ${dupe.id}. Use --force to add anyway.`);
      process.exit(2);
    }
    const contra = governance.findContradictions([...rules, rule]).filter(c => c.a === rule.id || c.b === rule.id);
    if (contra.length && !flags.has('--force')) {
      out(`CONTRADICTION with ${contra.map(c => c.a === rule.id ? c.b : c.a).join(', ')}. CHIRON never picks a winner.`);
      out('Reconcile the rules, archive the outdated one, or re-run with --force if they truly coexist.');
      process.exit(3);
    }
    rules.push(rule);
    ledger.save(p, rules);
    ledger.registerProject(root);
    archive.logChange(path.dirname(p), `added ${rule.id}: ${rule.rule}`);
    out(`Captured ${rule.id}. Compile it into your agents: chiron compile --apply`);
  },

  bump() {
    const id = argv[1];
    const p = ledgerPathFor();
    const rules = ledger.load(p);
    const r = rules.find(x => x.id === id);
    if (!r) { out(`rule ${id} not found`); process.exit(1); }
    r.occurrences++;
    r.updated = new Date().toISOString().slice(0, 10);
    const proj = path.basename(root);
    if (!r.projects.includes(proj)) r.projects.push(proj);
    ledger.save(p, rules);
    out(`${id} occurrences -> ${r.occurrences}`);
  },

  list() {
    const rules = ledger.load(ledgerPathFor());
    if (!rules.length) { out('ledger empty. capture with "chiron add" or sweep history with "chiron mine".'); return; }
    for (const r of rules) out(`${r.id} [${r.status}${r.type === 'gotcha' ? '/gotcha' : ''}] (${r.occurrences}x)${r.detail ? ' +detail' : ''} ${r.rule}`);
  },

  compile() {
    const rules = ledger.load(ledger.projectLedgerPath(root));
    const globalRules = ledger.load(ledger.globalLedgerPath());
    const all = [...globalRules, ...rules];
    const plan = compiler.compile(root, all, { apply: APPLY });
    for (const p of plan) {
      if (p.error) out(`FAIL ${p.target}: ${p.error}`);
      else out(`${APPLY && p.changed ? 'WROTE' : p.changed ? 'WOULD WRITE (dry-run)' : 'up-to-date'} ${p.target}: ${p.file}`);
    }
    if (!APPLY && plan.some(p => p.changed)) out('\nDry-run. Re-run with --apply to write.');
    if (APPLY) archive.logChange(ledger.projectDir(root), `compiled ${all.filter(r => r.status === 'active').length} rules -> ${plan.filter(p => p.changed).map(p => p.target).join(', ') || 'no changes'}`);
  },

  mine() {
    const storesArg = arg('--store');
    const res = miner.mine({
      stores: storesArg ? [storesArg] : undefined,
      limit: parseInt(arg('--limit', '40'), 10),
    });
    out(`Scanned ${res.filesScanned} transcripts across ${res.stores.length} store(s). Read-only, nothing written.`);
    if (!res.candidates.length) { out('No correction candidates found.'); return; }
    out(`\n${res.candidates.length} candidate correction(s). These are heuristic hits, NOT rules; distill the real ones with /chiron capture:\n`);
    for (const c of res.candidates) {
      out(`[${c.confidence}] (${c.tag}) ${c.excerpt}`);
      out(`    at ${c.file}:${c.line}\n`);
    }
    const outFile = arg('--out');
    if (outFile) { fs.writeFileSync(outFile, JSON.stringify(res, null, 2), 'utf8'); out(`Saved: ${outFile}`); }
  },

  check() {
    const rules = ledger.load(ledgerPathFor());
    const drift = compiler.verify(root, [...ledger.load(ledger.globalLedgerPath()), ...ledger.load(ledger.projectLedgerPath(root))]);
    const h = governance.health(rules, { compileDrift: drift.length > 0 });
    out(`CHIRON health: ${h.score}/100 (${h.active} active rules)`);
    if (h.duplicates.length) out(`duplicates: ${h.duplicates.map(d => `${d.a}~${d.b}(${d.similarity})`).join(', ')}`);
    if (h.contradictions.length) for (const c of h.contradictions) out(`CONTRADICTION ${c.a} vs ${c.b}: ${c.note}`);
    if (h.stale.length) out(`stale (>180d): ${h.stale.join(', ')}`);
    if (h.compileDrift) out(`compile drift: targets out of date -> chiron compile --apply (${drift.join(', ')})`);
    if (flags.has('--json')) json(h);
  },

  promote() {
    const candidates = governance.findPromotions(parseInt(arg('--min', '2'), 10));
    if (!candidates.length) { out('No promotion candidates (no rule appears in 2+ project ledgers yet).'); return; }
    for (const c of candidates) {
      out(`PROPOSE global: "${c.rule.rule}" (seen in: ${c.projects.join(', ')})`);
      if (APPLY) {
        const promoted = governance.applyPromotion(c);
        archive.logChange(ledger.globalDir(), `promoted ${promoted.id} from ${c.projects.join(', ')}`);
        out(`  -> promoted as ${promoted.id} in the global ledger`);
      }
    }
    if (!APPLY) out('\nDry-run. Re-run with --apply to promote.');
  },

  archive() {
    const id = argv[1];
    if (!id) { out('usage: chiron archive <rule-id> [--reason "..."] '); process.exit(1); }
    const res = archive.archiveRule(ledgerPathFor(), id, arg('--reason', 'user request'));
    out(res.ok ? `archived ${id} -> ${res.archive} (restore any time: chiron restore ${id})` : `ERROR: ${res.error}`);
  },

  restore() {
    const q = argv.slice(1).filter(a => !a.startsWith('--')).join(' ');
    if (!q) { out('usage: chiron restore <rule-id or search text>'); process.exit(1); }
    const res = archive.restoreRule(ledgerPathFor(), q);
    out(res.ok ? `restored ${res.rule.id} from ${res.from}` : `ERROR: ${res.error}`);
  },

  setup() {
    out('CHIRON setup: state readout. This command changes nothing; every step is optional and explained.\n');
    const steps = [];
    const lp = ledger.projectLedgerPath(root);
    steps.push({
      name: 'Project ledger', done: fs.existsSync(lp),
      why: 'the canonical store your rules live in. Without it, corrections stay trapped in chat history.',
      next: 'chiron init'
    });
    const targets = compiler.detectTargets(root);
    const drift = fs.existsSync(lp) ? compiler.verify(root, [...ledger.load(ledger.globalLedgerPath()), ...ledger.load(lp)]) : targets;
    steps.push({
      name: `Agent files compiled (${targets.join(', ')})`, done: fs.existsSync(lp) && drift.length === 0,
      why: 'rules only work if the agent reads them at session start. Compile projects your ledger into each agent\'s memory file inside managed markers; your own content is never touched.',
      next: 'chiron compile --apply'
    });
    const hookHint = path.join(require('os').homedir(), '.claude', 'settings.json');
    let hookRegistered = false;
    try { hookRegistered = (fs.readFileSync(hookHint, 'utf8')).includes('chiron-hook'); } catch {}
    steps.push({
      name: 'Live correction hook (optional)', done: hookRegistered,
      why: 'nudges the agent to capture a rule the moment you correct it, so nothing is lost. Without it, you rely on remembering to run /chiron capture or on periodic mining. It reads your prompt locally, adds one line of context, never blocks.',
      next: `add to ${hookHint} under hooks.UserPromptSubmit: node ${path.resolve(__dirname, '..', 'hooks', 'chiron-hook.js')}`
    });
    steps.push({
      name: 'History mined at least once (optional)', done: fs.existsSync(path.join(ledger.projectDir(root), 'mine-report.json')),
      why: 'your past sessions already contain corrections you paid for. Mining sweeps them read-only and lists candidates worth turning into rules.',
      next: `chiron mine --out ${path.join(ledger.projectDir(root), 'mine-report.json')}`
    });
    for (const s of steps) {
      out(`${s.done ? '[done]   ' : '[missing]'} ${s.name}`);
      out(`         why: ${s.why}`);
      if (!s.done) out(`         next: ${s.next}`);
      out('');
    }
    const missing = siblings.recommendMissing();
    if (missing.length) {
      out('Demiurge siblings you do not have yet (recommendations only, nothing auto-installs):');
      for (const m of missing) out(`  - ${m.name}: ${m.why}`);
    }
    const first = steps.find(s => !s.done);
    out(first ? `\nExact next action: ${first.next}` : '\nEverything is set. Correct your agent once; CHIRON keeps it corrected.');
  },

  status() { commands.check(); },

  help() {
    out(`CHIRON: Corrections Harvested Into Rules, Obeyed Next-session.

Chiron trained the heroes. CHIRON trains your agents: every correction you
make becomes a permanent rule, compiled into every agent's memory.

usage: chiron <command> [flags]

  init                       create the project ledger (.chiron/ledger.md)
  add --rule "..."           capture a rule (--mistake, --how, --detail, --type gotcha, --source; dedup + contradiction gated)
  bump <id>                  same lesson happened again: count it
  list                       show the ledger
  compile [--apply]          project rules into CLAUDE.md / AGENTS.md / .cursor / .windsurf (dry-run default)
  mine [--limit N] [--out f] sweep past transcripts for uncaptured corrections (read-only)
  check [--json]             health: duplicates, contradictions, stale rules, compile drift
  promote [--apply]          propose project rules seen in 2+ projects for the global ledger
  archive <id>               retire a rule (never deleted; dated archive + changelog)
  restore <id|text>          bring an archived rule back
  setup                      state-aware guided setup (reads, explains, changes nothing)

  --global                   operate on the global ledger (~/.chiron/global)
  --apply                    apply changes (everything defaults to dry-run)
`);
  }
};

(commands[cmd] || commands.help)();
