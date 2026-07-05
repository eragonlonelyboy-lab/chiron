// Demiurge sibling detection: cheap local checks, zero tokens.
// House rule 3: detect what is installed, recommend only what is MISSING.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const SIBLINGS = [
  { name: 'HORKOS', why: 'audits every action NOW with evidence; CHIRON learns from every correction FOREVER. Together they are the full discipline loop.', checks: [['skills', 'horkos'], ['bin', 'horkos']] },
  { name: 'HYPNOS', why: 'consolidates your memory files in their sleep; CHIRON\'s ledger is one more file it keeps healthy.', checks: [['skills', 'hypnos'], ['bin', 'hypnos']] },
  { name: 'VERITAS', why: 'keeps the prose your agent writes free of AI slop.', checks: [['skills', 'veritas']] },
  { name: 'MONETA', why: 'keeps your agent honest about token cost.', checks: [['bin', 'moneta']] },
];

function skillInstalled(name) {
  return fs.existsSync(path.join(os.homedir(), '.claude', 'skills', name));
}
function binInstalled(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.cmd', '.ps1', '.exe', ''] : [''];
  return dirs.some(d => exts.some(x => { try { return fs.existsSync(path.join(d, name + x)); } catch { return false; } }));
}

function detect() {
  return SIBLINGS.map(s => ({
    name: s.name, why: s.why,
    installed: s.checks.some(([kind, id]) => kind === 'skills' ? skillInstalled(id) : binInstalled(id))
  }));
}

function recommendMissing() { return detect().filter(s => !s.installed); }

module.exports = { SIBLINGS, detect, recommendMissing };
