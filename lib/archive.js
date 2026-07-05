// CHIRON archive: nothing is ever deleted. Retired rules land in a dated
// archive file and can be restored. Every applied change is logged.
'use strict';
const fs = require('fs');
const path = require('path');
const ledger = require('./ledger');

function archiveDir(chironDir) { return path.join(chironDir, 'archive'); }
function changelogPath(chironDir) { return path.join(chironDir, 'CHANGELOG.md'); }

function today() { return new Date().toISOString().slice(0, 10); }

function logChange(chironDir, line) {
  const p = changelogPath(chironDir);
  const stamp = new Date().toISOString();
  const entry = `- ${stamp} | ${line}\n`;
  fs.mkdirSync(chironDir, { recursive: true });
  fs.appendFileSync(p, entry, 'utf8');
}

// Archive a rule: move it out of the ledger into archive/YYYY-MM-DD.md
function archiveRule(ledgerPath, ruleId, reason) {
  const chironDir = path.dirname(ledgerPath);
  const rules = ledger.load(ledgerPath);
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx === -1) return { ok: false, error: `rule ${ruleId} not found` };
  const [rule] = rules.splice(idx, 1);
  rule.status = 'archived';
  const archPath = path.join(archiveDir(chironDir), `${today()}.md`);
  fs.mkdirSync(archiveDir(chironDir), { recursive: true });
  const block = `<!-- archived from ${path.basename(ledgerPath)} | reason: ${reason || 'unspecified'} -->\n## ${rule.id} | archived | ${rule.created}\n**Mistake:** ${rule.mistake}\n**Rule:** ${rule.rule}\n**Apply:** ${rule.apply}\n- source: ${rule.source}\n- projects: ${rule.projects.join(', ')}\n- occurrences: ${rule.occurrences}\n- updated: ${rule.updated}\n\n`;
  fs.appendFileSync(archPath, block, 'utf8');
  ledger.save(ledgerPath, rules);
  logChange(chironDir, `archived ${ruleId} (${reason || 'unspecified'}) -> archive/${today()}.md`);
  return { ok: true, rule, archive: archPath };
}

// Restore: search archive files for a rule id or a query string, put it back.
function restoreRule(ledgerPath, query) {
  const chironDir = path.dirname(ledgerPath);
  const dir = archiveDir(chironDir);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return { ok: false, error: 'no archive' }; }
  for (const f of files.sort().reverse()) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const rules = ledger.parse(content);
    const hit = rules.find(r => r.id === query || (r.rule || '').toLowerCase().includes(query.toLowerCase()));
    if (hit) {
      const live = ledger.load(ledgerPath);
      hit.status = 'active';
      if (live.some(r => r.id === hit.id)) hit.id = ledger.nextId(live);
      live.push(hit);
      ledger.save(ledgerPath, live);
      logChange(chironDir, `restored ${hit.id} from archive/${f}`);
      return { ok: true, rule: hit, from: f };
    }
  }
  return { ok: false, error: `no archived rule matches "${query}"` };
}

module.exports = { archiveDir, changelogPath, logChange, archiveRule, restoreRule };
