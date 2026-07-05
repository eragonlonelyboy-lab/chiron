// CHIRON cross-agent compiler: projects active rules into each agent's memory
// layer inside managed markers. Surgical: content outside markers is never
// touched. Per-target quirks follow the verified HYPNOS table.
'use strict';
const fs = require('fs');
const path = require('path');
const ledger = require('./ledger');

const BEGIN = '<!-- chiron:begin (managed by CHIRON, do not edit inside) -->';
const END = '<!-- chiron:end -->';
const WINDSURF_CAP = 12000; // hard per-workspace-file cap, fail loud

function ruleLines(rules, opts = {}) {
  const active = rules.filter(r => r.status === 'active');
  const lines = ['## Rules learned from corrections (CHIRON)', ''];
  for (const r of active) {
    lines.push(`- **${r.id}:** ${r.rule}${opts.withApply && r.apply ? ` (apply: ${r.apply})` : ''}`);
  }
  return lines.join('\n');
}

function injectBlock(existing, block) {
  const body = `${BEGIN}\n${block}\n${END}`;
  if (existing === null || existing === undefined) return body + '\n';
  const bi = existing.indexOf(BEGIN), ei = existing.indexOf(END);
  if (bi !== -1 && ei !== -1 && ei > bi) {
    return existing.slice(0, bi) + body + existing.slice(ei + END.length);
  }
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return existing + sep + body + '\n';
}

// Target definitions. Each returns { path, content } or an error.
const TARGETS = {
  claude: {
    file: root => path.join(root, 'CLAUDE.md'),
    render: rules => injectBlockInto(rules, {}),
  },
  agentsmd: {
    file: root => path.join(root, 'AGENTS.md'),
    render: rules => injectBlockInto(rules, {}), // plain markdown only (frontmatter spec not merged)
  },
  cursor: {
    file: root => path.join(root, '.cursor', 'rules', 'chiron.mdc'),
    render: rules => ({
      full: [
        '---',
        'description: Rules learned from user corrections, compiled by CHIRON',
        'alwaysApply: true',
        '---',
        '',
        ruleLines(rules)
      ].join('\n') + '\n',
      replaceWhole: true // .mdc is CHIRON-owned, whole-file write is safe
    }),
  },
  windsurf: {
    file: root => path.join(root, '.windsurf', 'rules', 'chiron.md'),
    render: rules => {
      const content = ruleLines(rules) + '\n';
      if (content.length > WINDSURF_CAP) {
        return { error: `windsurf output ${content.length} chars exceeds hard cap ${WINDSURF_CAP}. Archive or tighten rules first.` };
      }
      return { full: content, replaceWhole: true };
    },
  },
};

function injectBlockInto(rules) {
  return { block: ruleLines(rules) };
}

// Detect which targets exist in this project (zero tokens, local checks only).
function detectTargets(root) {
  const found = [];
  if (fs.existsSync(path.join(root, 'CLAUDE.md'))) found.push('claude');
  if (fs.existsSync(path.join(root, 'AGENTS.md'))) found.push('agentsmd');
  if (fs.existsSync(path.join(root, '.cursor'))) found.push('cursor');
  if (fs.existsSync(path.join(root, '.windsurf'))) found.push('windsurf');
  if (found.length === 0) found.push('claude'); // sensible default: create CLAUDE.md block
  return found;
}

// Compile: dry-run by default. Returns per-target planned writes as diffs.
function compile(root, rules, opts = {}) {
  const targets = opts.targets || detectTargets(root);
  const plan = [];
  for (const name of targets) {
    const t = TARGETS[name];
    if (!t) { plan.push({ target: name, error: 'unknown target' }); continue; }
    const filePath = t.file(root);
    const rendered = t.render(rules);
    if (rendered.error) { plan.push({ target: name, file: filePath, error: rendered.error }); continue; }
    const existing = ledger.readFileSafe(filePath);
    const next = rendered.replaceWhole ? rendered.full : injectBlock(existing, rendered.block);
    const changed = existing !== next;
    plan.push({ target: name, file: filePath, changed, before: existing, after: next });
  }
  if (opts.apply) {
    for (const p of plan) {
      if (p.error || !p.changed) continue;
      ledger.writeFileUtf8(p.file, p.after);
    }
  }
  return plan;
}

// Verify: does each compiled block match the current ledger? (compile drift check)
function verify(root, rules, opts = {}) {
  const plan = compile(root, rules, Object.assign({}, opts, { apply: false }));
  return plan.filter(p => !p.error && p.changed).map(p => p.target);
}

module.exports = { BEGIN, END, WINDSURF_CAP, ruleLines, injectBlock, detectTargets, compile, verify };
