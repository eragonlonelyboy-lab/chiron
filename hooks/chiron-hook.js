#!/usr/bin/env node
// CHIRON live hook (UserPromptSubmit). Two triggers, both add a one-line capture
// nudge and never block:
//   1. the user's message looks like a correction (scanText), or
//   2. HORKOS caught a false-completion or evidence gap this session: its monotonic
//      `caught` counter grew. Auditor catches are prime rule material, and this fires
//      even when the catch was resolved before the user's next message.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { scanText } = require('../lib/mine');

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
}

// Nudge once per NEW HORKOS catch this session. HORKOS bumps `caught` on every
// Stop-hook block; a per-session marker records the count we last nudged at, so a
// fresh catch (counter grew) fires exactly once and a resolved-and-quiet session
// stays silent. Baseline is set on first sight so prior-session catches never fire.
function detectHorkosCatch(sessionId) {
  if (!sessionId) return null;
  try {
    const horkosHome = process.env.HORKOS_HOME || path.join(os.homedir(), '.horkos');
    const stats = readJSON(path.join(horkosHome, 'stats.json'), null);
    if (!stats || typeof stats.caught !== 'number') return null;
    const caught = stats.caught;

    const chironHome = process.env.CHIRON_HOME || path.join(os.homedir(), '.chiron');
    const markerPath = path.join(chironHome, 'horkos-watch', String(sessionId) + '.json');
    const marker = readJSON(markerPath, null);
    if (!marker) {
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, JSON.stringify({ baseline: caught, nudgedCaught: caught }), 'utf8');
      return null;
    }
    if (caught > marker.nudgedCaught) {
      marker.nudgedCaught = caught;
      fs.writeFileSync(markerPath, JSON.stringify(marker), 'utf8');
      const audit = readJSON(path.join(horkosHome, 'sessions', String(sessionId), 'audit.json'), null);
      const s = audit && audit.summary;
      if (s) {
        const bits = [];
        if (s.phantom_claims) bits.push(s.phantom_claims + ' phantom claim(s)');
        if (s.fail) bits.push(s.fail + ' failed verification(s)');
        if (s.silent_failures) bits.push(s.silent_failures + ' silent failure(s)');
        if (bits.length) return ' (' + bits.join(', ') + ')';
      }
      return '';
    }
    return null;
  } catch {
    return null;
  }
}

let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const prompt = payload.prompt || payload.user_prompt || '';
    const sessionId = payload.session_id || payload.sessionId || '';
    const parts = [];
    const tag = scanText(String(prompt));
    if (tag) parts.push(`this message looks like a correction (${tag})`);
    const horkos = detectHorkosCatch(sessionId);
    if (horkos !== null) parts.push(`HORKOS caught a false-completion or evidence gap this session${horkos}`);
    if (parts.length) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `CHIRON: ${parts.join('; and ')}. Once resolved, capture the durable lesson as a permanent rule with /chiron capture so the class of mistake never repeats.`
        }
      }));
    }
  } catch {
    // Garbage stdin must never break the user's session. Exit clean, say nothing.
  }
  process.exit(0);
});
