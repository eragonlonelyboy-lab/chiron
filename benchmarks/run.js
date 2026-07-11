// CHIRON benchmark suite. Seeded scenarios, reproducible, no network, no LLM.
// Run: node benchmarks/run.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const ledger = require('../lib/ledger');
const governance = require('../lib/governance');
const compiler = require('../lib/compiler');
const archive = require('../lib/archive');
const miner = require('../lib/mine');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}
function tmpDir(name) {
  const d = path.join(os.tmpdir(), `chiron-bench-${name}-${process.pid}`);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function rule(id, text, extra = {}) {
  return Object.assign({
    id, status: 'active', created: '2026-07-01', mistake: 'm', rule: text, apply: 'a',
    source: 'bench', projects: ['bench'], occurrences: 1, updated: '2026-07-01'
  }, extra);
}

// --- 1. Ledger round-trip ----------------------------------------------------
(() => {
  const d = tmpDir('ledger');
  const p = path.join(d, '.chiron', 'ledger.md');
  const rules = [
    rule('CHI-R001', 'Validate canvas JSON after every write'),
    rule('CHI-R002', 'Use py not python on Windows', { occurrences: 3, projects: ['a', 'b'] }),
  ];
  ledger.save(p, rules);
  const back = ledger.load(p);
  check('ledger: round-trip count', back.length === 2);
  check('ledger: fields survive', back[1].occurrences === 3 && back[1].projects.join(',') === 'a,b' && back[0].rule === rules[0].rule);
  check('ledger: nextId', ledger.nextId(back) === 'CHI-R003');
})();

// --- 2. Dedup ------------------------------------------------------------------
(() => {
  const a = rule('CHI-R001', 'Always validate canvas JSON files after every single write operation');
  const b = rule('CHI-R002', 'Validate canvas JSON after every write');
  const c = rule('CHI-R003', 'Prefer PowerShell here-strings for multiline input');
  check('dedup: near-duplicate caught', governance.findDuplicates([a, b, c]).length === 1);
  check('dedup: unrelated not flagged', governance.findDuplicates([a, c]).length === 0);
})();

// --- 3. Contradiction (surfaced, never auto-fixed) -------------------------------
(() => {
  const a = rule('CHI-R001', 'Always use tabs for indentation in this repo');
  const b = rule('CHI-R002', 'Never use tabs for indentation in source files of this repo');
  const before = JSON.stringify([a, b]);
  const hits = governance.findContradictions([a, b]);
  check('contradiction: opposite polarity surfaced', hits.length === 1);
  check('contradiction: zero auto-fix', JSON.stringify([a, b]) === before);
  const c = rule('CHI-R003', 'Always run tests before commit');
  const d = rule('CHI-R004', 'Never store tokens in memory files');
  check('contradiction: unrelated polarity pair not flagged', governance.findContradictions([c, d]).length === 0);
})();

// --- 4. Compiler: surgical markers, idempotent, per-target quirks ----------------
(() => {
  const d = tmpDir('compile');
  const userContent = '# My project\n\nMy own precious instructions.\n';
  fs.writeFileSync(path.join(d, 'CLAUDE.md'), userContent, 'utf8');
  fs.mkdirSync(path.join(d, '.cursor'), { recursive: true });
  fs.mkdirSync(path.join(d, '.windsurf'), { recursive: true });
  const rules = [rule('CHI-R001', 'Use py not python on Windows')];

  const dry = compiler.compile(d, rules, { apply: false });
  check('compile: dry-run writes nothing', fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8') === userContent);

  compiler.compile(d, rules, { apply: true });
  const after = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  check('compile: user content intact outside markers', after.startsWith(userContent.trimEnd()) || after.includes('My own precious instructions.'));
  check('compile: markers present', after.includes(compiler.BEGIN) && after.includes(compiler.END));

  const mdc = fs.readFileSync(path.join(d, '.cursor', 'rules', 'chiron.mdc'), 'utf8');
  check('compile: .mdc frontmatter valid', mdc.startsWith('---\n') && mdc.includes('alwaysApply: true'));

  compiler.compile(d, rules, { apply: true });
  const after2 = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  check('compile: idempotent (no marker duplication)', after2 === after && after2.split(compiler.BEGIN).length === 2);

  const rules2 = [...rules, rule('CHI-R002', 'Escape quotes in canvas text values')];
  compiler.compile(d, rules2, { apply: true });
  const after3 = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  check('compile: block updates in place', after3.includes('CHI-R002') && after3.split(compiler.BEGIN).length === 2);
  check('compile: drift verify detects and clears', compiler.verify(d, rules2).length === 0 && compiler.verify(d, rules).length > 0);

  const big = [rule('CHI-R100', 'x'.repeat(13000))];
  const plan = compiler.compile(d, big, { apply: false, targets: ['windsurf'] });
  check('compile: windsurf hard cap fails loud', plan[0].error && plan[0].error.includes('cap'));
})();

// --- 5. Mining: seeded transcripts, measured detection ---------------------------
(() => {
  const d = tmpDir('mine');
  const mk = (turns) => turns.map(t => JSON.stringify(t)).join('\n');
  // 6 planted corrections (with assistant acks) + noise turns
  const planted = [
    ['no, I asked for the staging config not production', 'You\'re right, I grabbed the wrong file.'],
    ['that\'s wrong, the rate is 12% for standard tier', 'My mistake, correcting that now.'],
    ['you didn\'t update the index file like I said', 'You\'re right, I missed the index.'],
    ['why did you delete the archive folder?', 'I apologize, I misunderstood the instruction.'],
    ['don\'t use em dashes in any product copy', 'You\'re right, my mistake, switching to colons.'],
    ['I said the ledger lives in .chiron not .config', 'My error, moving it now.'],
  ];
  const noise = [
    ['please add a new endpoint for user search', 'Adding the endpoint now.'],
    ['looks great, ship it', 'Shipping.'],
    ['can you also write tests', 'Writing tests.'],
    ['what does this function do', 'It parses the ledger.'],
  ];
  const turns = [];
  for (const [u, a] of [...planted, ...noise]) {
    turns.push({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: u }] } });
    turns.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: a }] } });
  }
  fs.writeFileSync(path.join(d, 'session.jsonl'), mk(turns), 'utf8');
  const res = miner.mine({ stores: [d] });
  const found = res.candidates.length;
  const high = res.candidates.filter(c => c.confidence === 'high').length;
  check('mine: detects planted corrections (>=5/6)', found >= 5, `found ${found}`);
  check('mine: acks upgrade confidence', high >= 5, `high ${high}`);
  const noiseHits = res.candidates.filter(c => noise.some(n => c.excerpt.includes(n[0].slice(0, 30)))).length;
  check('mine: noise false positives = 0 on this corpus', noiseHits === 0, `noise hits ${noiseHits}`);
  // system-reminder user turns must be ignored
  fs.writeFileSync(path.join(d, 'sys.jsonl'), mk([
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>no, this is injected</system-reminder>' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'You\'re right.' }] } },
  ]), 'utf8');
  const res2 = miner.mine({ stores: [d] });
  check('mine: system-injected turns ignored', res2.candidates.length === found);
  console.log(`  measured: ${found}/6 planted detected, ${noiseHits} noise hits (corpus of ${noise.length} noise turns)`);
})();

// --- 6. Promote-to-global (registry-scoped to fixtures via env HOME swap) --------
(() => {
  // Simulate two project ledgers + a registry by calling internals directly.
  const dA = tmpDir('projA'), dB = tmpDir('projB');
  const shared = 'Read the module impl note before touching any controller';
  ledger.save(ledger.projectLedgerPath(dA), [rule('CHI-R001', shared)]);
  ledger.save(ledger.projectLedgerPath(dB), [rule('CHI-R001', shared), rule('CHI-R002', 'Local-only rule about fixtures')]);
  // temporary registry pointing at fixtures
  const realHome = os.homedir();
  const fakeReg = { projects: [dA, dB] };
  const regDir = path.join(os.tmpdir(), `chiron-bench-reg-${process.pid}`);
  fs.mkdirSync(regDir, { recursive: true });
  // monkey-patch paths for the test
  const origLoadReg = ledger.loadRegistry, origGlobalPath = ledger.globalLedgerPath;
  ledger.loadRegistry = () => fakeReg;
  ledger.globalLedgerPath = () => path.join(regDir, 'global-ledger.md');
  const candidates = governance.findPromotions(2);
  check('promote: cross-project rule proposed', candidates.length === 1 && candidates[0].rule.rule === shared);
  check('promote: single-project rule not proposed', !candidates.some(c => c.rule.rule.includes('Local-only')));
  const promoted = governance.applyPromotion(candidates[0]);
  const globalRules = ledger.load(ledger.globalLedgerPath());
  check('promote: applied lands in global ledger with provenance', globalRules.length === 1 && globalRules[0].source.includes('promoted from'));
  check('promote: idempotent (already-promoted not re-proposed)', governance.findPromotions(2).length === 0);
  ledger.loadRegistry = origLoadReg; ledger.globalLedgerPath = origGlobalPath;
})();

// --- 7. Archive + restore + changelog --------------------------------------------
(() => {
  const d = tmpDir('archive');
  const p = path.join(d, '.chiron', 'ledger.md');
  ledger.save(p, [rule('CHI-R001', 'Old rule to retire'), rule('CHI-R002', 'Keeper rule')]);
  const res = archive.archiveRule(p, 'CHI-R001', 'superseded in bench');
  check('archive: rule leaves ledger', res.ok && ledger.load(p).length === 1);
  check('archive: dated archive file written', fs.existsSync(res.archive) && fs.readFileSync(res.archive, 'utf8').includes('Old rule to retire'));
  const back = archive.restoreRule(p, 'CHI-R001');
  check('archive: restore round-trip', back.ok && ledger.load(p).length === 2);
  const log = fs.readFileSync(archive.changelogPath(path.join(d, '.chiron')), 'utf8');
  check('archive: changelog append-only records both', log.includes('archived CHI-R001') && log.includes('restored'));
})();

// --- 8. Hook: correction nudge + garbage-stdin survival ---------------------------
(() => {
  const hook = path.join(__dirname, '..', 'hooks', 'chiron-hook.js');
  const run = (input) => cp.spawnSync(process.execPath, [hook], { input, encoding: 'utf8', timeout: 10000 });
  const r1 = run(JSON.stringify({ prompt: 'no, I said use the staging endpoint' }));
  check('hook: correction nudge emitted', r1.status === 0 && r1.stdout.includes('additionalContext'));
  const r2 = run(JSON.stringify({ prompt: 'please add a search feature' }));
  check('hook: non-correction stays silent', r2.status === 0 && r2.stdout.trim() === '');
  const r3 = run('this is not json {{{');
  check('hook: garbage stdin survives silently', r3.status === 0 && r3.stdout.trim() === '');
})();

// --- 9. Health: deterministic -----------------------------------------------------
(() => {
  const rules = [
    rule('CHI-R001', 'Always use tabs for indentation here'),
    rule('CHI-R002', 'Never use tabs for indentation in this codebase here'),
    rule('CHI-R003', 'Validate canvas JSON after write'),
    rule('CHI-R004', 'Validate the canvas JSON files after every write'),
  ];
  const h1 = governance.health(rules, { now: '2026-07-05' });
  const h2 = governance.health(rules, { now: '2026-07-05' });
  check('health: deterministic', JSON.stringify(h1) === JSON.stringify(h2));
  check('health: deductions applied', h1.score < 100 && h1.duplicates.length >= 1 && h1.contradictions.length >= 1);
  const clean = governance.health([rule('CHI-R001', 'Validate canvas JSON after write', { updated: '2026-07-01' })], { now: '2026-07-05' });
  check('health: clean ledger scores 100', clean.score === 100);
})();

// --- 10. House copy lint: zero em/en dashes repo-wide -----------------------------
(() => {
  const root = path.join(__dirname, '..');
  const offenders = [];
  function scan(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(md|js|json)$/.test(e.name)) {
        const content = fs.readFileSync(p, 'utf8');
        if (/[\u2014\u2013]/.test(content)) offenders.push(path.relative(root, p));
      }
    }
  }
  scan(root);
  check('copy lint: zero em/en dashes repo-wide', offenders.length === 0, offenders.join(', '));
})();

// --- 11. Detail + type: rich journal field, gotchas excluded from compile --------
(() => {
  const d = tmpDir('detail');
  const p = path.join(d, '.chiron', 'ledger.md');
  const multiDetail = 'Failure: the parser dropped rows.\n- cause: CRLF vs LF mismatch\n- fix: normalize both sides before compare\nSecond paragraph of the note.';
  const rules = [
    rule('CHI-R001', 'Normalize line endings before comparing', { detail: multiDetail, type: 'gotcha' }),
    rule('CHI-R002', 'Re-fetch before every full-page overwrite', { type: 'correction' }),
    rule('CHI-R003', 'Old style rule with no detail or type field'),
  ];
  ledger.save(p, rules);
  const back = ledger.load(p);
  check('detail: multi-line detail round-trips exactly', back[0].detail === multiDetail, JSON.stringify(back[0].detail));
  check('detail: bullet lines inside detail preserved', back[0].detail.includes('- cause: CRLF vs LF mismatch'));
  check('detail: type persists', back[0].type === 'gotcha' && back[1].type === 'correction');
  check('detail: missing type defaults to correction (backward compat)', back[2].type === 'correction');
  check('detail: missing detail is empty (backward compat)', back[2].detail === '');
  // a heading line inside detail must not split into a phantom rule block
  ledger.save(p, [rule('CHI-R001', 'x', { detail: '## not a heading\nline two', type: 'gotcha' })]);
  check('detail: heading marker in detail does not create phantom rule', ledger.load(p).length === 1);
  // compile keeps gotchas in the ledger journal, out of agent files
  fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# proj\n', 'utf8');
  compiler.compile(d, back, { apply: true });
  const cc = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  check('detail: gotcha excluded from compiled agent file', !cc.includes('CHI-R001'));
  check('detail: corrections included in compiled agent file', cc.includes('CHI-R002') && cc.includes('CHI-R003'));
})();

// --- 12. Parked dissent can be vindicated without becoming policy ---------------
(() => {
  const dissent = rule('CHI-R090', 'Payment settlement may fail when royalty rounding uses floating point', { type: 'dissent' });
  dissent.status = 'parked';
  dissent.source = 'rejected review round 2';
  const hits = governance.resurfaceDissent([dissent], 'Incident: payment settlement failed because royalty rounding used floating point');
  check('dissent: later matching incident resurfaces parked finding', hits.length === 1 && hits[0].id === 'CHI-R090');
  check('dissent: resurfacing never auto-changes policy', hits[0].action.includes('do not auto-change policy'));
  check('dissent: unrelated incident stays quiet', governance.resurfaceDissent([dissent], 'CSS button color changed').length === 0);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
