#!/usr/bin/env node
// CHIRON live hook (UserPromptSubmit). Ships DORMANT: register it only via
// `chiron setup` guidance. When a user turn looks like a correction, it adds
// a one-line nudge so the agent offers to capture the rule. It never blocks.
'use strict';
const { scanText } = require('../lib/mine');

let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const prompt = payload.prompt || payload.user_prompt || '';
    const tag = scanText(String(prompt));
    if (tag) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `CHIRON: this message looks like a correction (${tag}). After resolving it, offer to capture it as a permanent rule with /chiron capture so the mistake never repeats.`
        }
      }));
    }
  } catch {
    // Garbage stdin must never break the user's session. Exit clean, say nothing.
  }
  process.exit(0);
});
