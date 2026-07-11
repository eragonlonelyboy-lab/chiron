// CHIRON governance: dedup, contradiction surfacing, promote-to-global, health.
// All deterministic. CHIRON surfaces and proposes; it never auto-resolves.
'use strict';
const path = require('path');
const ledger = require('./ledger');

// --- Dedup -----------------------------------------------------------------
function findDuplicates(rules, threshold = 0.6) {
  const dupes = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (rules[i].status !== 'active' || rules[j].status !== 'active') continue;
      const sim = ledger.jaccard(ledger.fingerprint(rules[i]), ledger.fingerprint(rules[j]));
      if (sim >= threshold) dupes.push({ a: rules[i].id, b: rules[j].id, similarity: +sim.toFixed(2) });
    }
  }
  return dupes;
}

// --- Contradiction ----------------------------------------------------------
// Heuristic polarity detection: two rules sharing a token core but pulling in
// opposite directions (always vs never, use vs avoid, do vs do not).
const POS = /\b(always|must|use|do|prefer|require)\b/i;
const NEG = /\b(never|don'?t|do not|avoid|ban|forbid|stop)\b/i;
function polarity(text) {
  // Negation dominates: "never use X" is a negative directive even though it
  // contains a positive verb.
  if (NEG.test(text)) return -1;
  if (POS.test(text)) return 1;
  return 0;
}
function findContradictions(rules, coreOverlap = 0.5) {
  const hits = [];
  const active = rules.filter(r => r.status === 'active');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const pi = polarity(active[i].rule), pj = polarity(active[j].rule);
      if (pi === 0 || pj === 0 || pi === pj) continue;
      const sim = ledger.jaccard(ledger.fingerprint(active[i]), ledger.fingerprint(active[j]));
      if (sim >= coreOverlap) {
        hits.push({
          a: active[i].id, b: active[j].id, similarity: +sim.toFixed(2),
          note: 'opposite polarity on a shared core. CHIRON does not pick a winner: review and archive one, or reconcile.'
        });
      }
    }
  }
  return hits;
}

// --- Promote-to-global -------------------------------------------------------
// A rule whose fingerprint appears in >= minProjects project ledgers is proposed
// for the global ledger. Proposal only; apply is explicit.
function findPromotions(minProjects = 2) {
  const reg = ledger.loadRegistry();
  const globalRules = ledger.load(ledger.globalLedgerPath());
  const seen = []; // { rule, roots: [] }
  for (const root of reg.projects) {
    const rules = ledger.load(ledger.projectLedgerPath(root));
    for (const r of rules) {
      if (r.status !== 'active') continue;
      const match = seen.find(s => ledger.isDuplicate(s.rule, r));
      if (match) { if (!match.roots.includes(root)) match.roots.push(root); }
      else seen.push({ rule: r, roots: [root] });
    }
  }
  return seen
    .filter(s => s.roots.length >= minProjects)
    .filter(s => !globalRules.some(g => g.status === 'active' && ledger.isDuplicate(g, s.rule)))
    .map(s => ({
      rule: s.rule,
      projects: s.roots.map(r => path.basename(r)),
      proposal: `seen in ${s.roots.length} projects: promote to global ledger`
    }));
}

function applyPromotion(candidate) {
  const globalPath = ledger.globalLedgerPath();
  const globalRules = ledger.load(globalPath);
  const promoted = Object.assign({}, candidate.rule, {
    id: ledger.nextId(globalRules),
    projects: candidate.projects,
    source: `promoted from ${candidate.projects.join(', ')} (origin ${candidate.rule.id})`
  });
  globalRules.push(promoted);
  ledger.save(globalPath, globalRules);
  return promoted;
}

// Parked dissent never compiles into agent rules. When a later incident shares
// its concrete vocabulary, resurface it for human review without changing policy.
function resurfaceDissent(rules, incident, threshold = 0.2) {
  const probe = { rule: String(incident || '') };
  return rules
    .filter(r => r.type === 'dissent' && ['active', 'parked'].includes(r.status))
    .map(r => ({ rule: r, similarity: ledger.jaccard(ledger.fingerprint(r), ledger.fingerprint(probe)) }))
    .filter(x => x.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .map(x => ({ id: x.rule.id, rule: x.rule.rule, source: x.rule.source, similarity: +x.similarity.toFixed(2), action: 'review only; do not auto-change policy' }));
}

// --- Health ------------------------------------------------------------------
// 0-100, deterministic. Deductions: duplicates, contradictions, stale actives,
// compile drift (checked by caller via compiler.verify and passed in).
function health(rules, opts = {}) {
  const active = rules.filter(r => r.status === 'active');
  const dupes = findDuplicates(rules);
  const contras = findContradictions(rules);
  const now = opts.now ? new Date(opts.now) : new Date();
  const stale = active.filter(r => {
    const d = new Date(r.updated || r.created);
    return !isNaN(d) && (now - d) / 86400000 > (opts.staleDays || 180);
  });
  let score = 100;
  score -= Math.min(30, dupes.length * 10);
  score -= Math.min(40, contras.length * 20);
  score -= Math.min(20, stale.length * 2);
  if (opts.compileDrift) score -= 10;
  return {
    score: Math.max(0, score),
    active: active.length,
    duplicates: dupes,
    contradictions: contras,
    stale: stale.map(r => r.id),
    compileDrift: !!opts.compileDrift
  };
}

module.exports = { findDuplicates, findContradictions, polarity, findPromotions, applyPromotion, resurfaceDissent, health };
