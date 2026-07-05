// CHIRON retro transcript mining: sweep past session transcripts for user
// corrections that were never captured as rules. Deterministic heuristics,
// zero LLM, read-only. Output = CANDIDATES with pointers, never auto-rules.
// Honesty rule: heuristics have false positives; the skill distills, a human gates.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// User-turn correction signals. Anchored to reduce noise.
const USER_PATTERNS = [
  { re: /^no[,.]?\s/i, tag: 'flat-no' },
  { re: /\bthat'?s (wrong|not right|incorrect|not what i)/i, tag: 'wrong' },
  { re: /\byou (didn'?t|did not|forgot|missed|ignored)/i, tag: 'omission' },
  { re: /\bi (said|told you|asked for|meant)\b/i, tag: 'restate' },
  { re: /\bwhy (did|are) you\b/i, tag: 'challenge' },
  { re: /\b(don'?t|do not|stop|never) (do|use|write|add|delete|touch)\b/i, tag: 'prohibit' },
  { re: /\bagain\b.*\b(wrong|same|mistake|error)\b/i, tag: 'repeat-offense' },
  { re: /\bshould (be|have been|not)\b/i, tag: 'should' },
  { re: /\bwrong (file|folder|branch|name|path|format|place)\b/i, tag: 'wrong-target' },
];
// Assistant-turn acknowledgement markers (strong confirmation the prior user turn was a correction).
const ACK_PATTERNS = [
  /\byou'?re right\b/i,
  /\bmy (mistake|error|bad)\b/i,
  /\bi (apologize|misread|misunderstood|shouldn'?t have)\b/i,
  /\bcorrecting (that|this|now)\b/i,
];

function extractText(message) {
  if (!message) return '';
  const c = message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter(b => b && b.type === 'text').map(b => b.text || '').join('\n');
  return '';
}

function scanText(text) {
  if (!text) return null;
  // skip pasted logs / tool noise: correction signals live in short human turns
  const head = text.slice(0, 600);
  for (const p of USER_PATTERNS) {
    if (p.re.test(head)) return p.tag;
  }
  return null;
}

function hasAck(text) { return ACK_PATTERNS.some(re => re.test(text.slice(0, 800))); }

// Scan one JSONL transcript. Returns candidate corrections with line pointers.
function scanTranscript(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const lines = raw.split('\n');
  const candidates = [];
  let prev = null; // { tag, lineNo, excerpt }
  for (let i = 0; i < lines.length; i++) {
    let obj;
    try { obj = JSON.parse(lines[i]); } catch { continue; }
    const type = obj.type || (obj.message && obj.message.role);
    if (type === 'user') {
      const text = extractText(obj.message || obj);
      // system-injected content is not a human correction
      if (text.includes('<system-reminder>') || text.includes('tool_result')) { prev = null; continue; }
      const tag = scanText(text);
      prev = tag ? { tag, lineNo: i + 1, excerpt: text.slice(0, 200).replace(/\s+/g, ' ').trim() } : null;
    } else if (type === 'assistant' && prev) {
      const text = extractText(obj.message || obj);
      const confirmed = hasAck(text);
      candidates.push({
        file: filePath, line: prev.lineNo, tag: prev.tag,
        confidence: confirmed ? 'high' : 'medium',
        excerpt: prev.excerpt
      });
      prev = null;
    }
  }
  return candidates;
}

// Default transcript stores (Claude Code + Codex), overridable.
function defaultStores() {
  return [
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), '.codex', 'sessions'),
  ].filter(p => fs.existsSync(p));
}

function listTranscripts(storeDir, maxFiles = 500) {
  const out = [];
  function walk(dir, depth) {
    if (depth > 4 || out.length >= maxFiles) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  }
  walk(storeDir, 0);
  return out;
}

function mine(opts = {}) {
  const stores = opts.stores || defaultStores();
  const results = { stores, filesScanned: 0, candidates: [] };
  for (const store of stores) {
    const files = listTranscripts(store, opts.maxFiles || 500);
    for (const f of files) {
      results.filesScanned++;
      results.candidates.push(...scanTranscript(f));
    }
  }
  // high-confidence first, then by tag specificity
  results.candidates.sort((a, b) => (a.confidence === b.confidence) ? 0 : (a.confidence === 'high' ? -1 : 1));
  if (opts.limit) results.candidates = results.candidates.slice(0, opts.limit);
  return results;
}

module.exports = { USER_PATTERNS, ACK_PATTERNS, scanText, hasAck, scanTranscript, defaultStores, listTranscripts, mine };
