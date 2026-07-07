// CHIRON ledger: the canonical rule store. Git-diffable markdown, strict structure.
// Rule format is Eragon's proven lessons discipline: Mistake / Rule / Apply + metadata.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const LEDGER_NAME = 'ledger.md';
const HEADER = '# CHIRON Ledger\n\nRules distilled from corrections. Managed by CHIRON; edit by hand only if you keep the structure.\n';

function projectDir(root) { return path.join(root, '.chiron'); }
function projectLedgerPath(root) { return path.join(projectDir(root), LEDGER_NAME); }
function globalDir() { return path.join(os.homedir(), '.chiron', 'global'); }
function globalLedgerPath() { return path.join(globalDir(), LEDGER_NAME); }
function registryPath() { return path.join(os.homedir(), '.chiron', 'registry.json'); }

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8').replace(/^﻿/, ''); } catch { return null; }
}
function writeFileUtf8(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8'); // Node writes BOM-less UTF-8
}

// Parse a ledger file into rule objects.
// Rule block shape:
// ## CHI-R003 | active | 2026-07-05
// **Mistake:** ...
// **Rule:** ...
// **Apply:** ...
// - source: ...
// - projects: a, b
// - occurrences: 2
// - updated: 2026-07-05
function parse(content) {
  if (!content) return [];
  const rules = [];
  const blocks = content.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const head = lines[0].split('|').map(s => s.trim());
    const rule = {
      id: head[0] || '',
      status: head[1] || 'active',
      created: head[2] || '',
      mistake: '', rule: '', apply: '', detail: '', type: 'correction',
      source: '', projects: [], occurrences: 1, updated: head[2] || ''
    };
    const body = lines.slice(1);
    // meta keys are a fixed set; a "- " line is meta ONLY if it names one of them,
    // so bullet lists inside a multi-line Detail block are never mistaken for meta.
    const metaRe = /^- (source|type|projects|occurrences|updated):\s*(.*)$/;
    for (let li = 0; li < body.length; li++) {
      const line = body[li];
      const m = line.match(/^\*\*(Mistake|Rule|Apply):\*\*\s*(.*)$/);
      if (m) { rule[m[1].toLowerCase()] = m[2].trim(); continue; }
      const dm = line.match(/^\*\*Detail:\*\*\s*(.*)$/);
      if (dm) {
        const buf = [];
        if (dm[1]) buf.push(dm[1]);
        while (li + 1 < body.length && !metaRe.test(body[li + 1])) { li++; buf.push(body[li]); }
        rule.detail = buf.join('\n').replace(/\s+$/, '');
        continue;
      }
      const meta = line.match(metaRe);
      if (meta) {
        if (meta[1] === 'projects') rule.projects = meta[2].split(',').map(s => s.trim()).filter(Boolean);
        else if (meta[1] === 'occurrences') rule.occurrences = parseInt(meta[2], 10) || 1;
        else rule[meta[1]] = meta[2].trim();
      }
    }
    if (rule.id) rules.push(rule);
  }
  return rules;
}

function serializeRule(r) {
  const lines = [
    `## ${r.id} | ${r.status} | ${r.created}`,
    `**Mistake:** ${r.mistake}`,
    `**Rule:** ${r.rule}`,
    `**Apply:** ${r.apply}`,
  ];
  if (r.detail && r.detail.trim()) {
    // Strip leading markdown heading markers so a Detail line can never start
    // with "## " and get mis-split as a new rule block on the next parse.
    lines.push('**Detail:**');
    lines.push(r.detail.replace(/^\s*#{1,6}\s+/gm, '').replace(/\s+$/, ''));
  }
  lines.push(`- source: ${r.source || 'manual'}`);
  lines.push(`- type: ${r.type || 'correction'}`);
  lines.push(`- projects: ${(r.projects || []).join(', ')}`);
  lines.push(`- occurrences: ${r.occurrences || 1}`);
  lines.push(`- updated: ${r.updated || r.created}`);
  lines.push('');
  return lines.join('\n');
}

function serialize(rules) {
  return HEADER + '\n' + rules.map(serializeRule).join('\n');
}

function load(ledgerPath) { return parse(readFileSafe(ledgerPath)); }

function save(ledgerPath, rules) { writeFileUtf8(ledgerPath, serialize(rules)); }

function nextId(rules) {
  let max = 0;
  for (const r of rules) {
    const m = r.id.match(/^CHI-R(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CHI-R${String(max + 1).padStart(3, '0')}`;
}

// Fingerprint: normalized token set of the Rule line. Deterministic, zero-LLM.
const STOP = new Set(['a','an','the','to','of','in','on','for','and','or','is','are','be','it','this','that','with','at','by','as','do','not','dont','never','always','before','after','when','use','must']);
function tokens(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !STOP.has(t));
}
function fingerprint(rule) { return [...new Set(tokens(rule.rule))].sort(); }
function jaccard(aSet, bSet) {
  const a = new Set(aSet), b = new Set(bSet);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
// Duplicate when rule-line token overlap is high.
function isDuplicate(r1, r2, threshold = 0.6) {
  return jaccard(fingerprint(r1), fingerprint(r2)) >= threshold;
}

// Registry of project ledgers (for promote-to-global scanning).
function loadRegistry() {
  const raw = readFileSafe(registryPath());
  if (!raw) return { projects: [] };
  try { return JSON.parse(raw); } catch { return { projects: [] }; }
}
function registerProject(root) {
  const reg = loadRegistry();
  const abs = path.resolve(root);
  if (!reg.projects.includes(abs)) {
    reg.projects.push(abs);
    writeFileUtf8(registryPath(), JSON.stringify(reg, null, 2));
  }
  return reg;
}

module.exports = {
  projectDir, projectLedgerPath, globalDir, globalLedgerPath, registryPath,
  parse, serialize, serializeRule, load, save, nextId,
  tokens, fingerprint, jaccard, isDuplicate,
  loadRegistry, registerProject, readFileSafe, writeFileUtf8
};
