#!/usr/bin/env node
// cc-efficient — UserPromptSubmit classifier hook
//
// Goal: classify each user prompt into Recall / Transform / Reason tier and inject
// a one-line hint into Claude's context BEFORE Claude routes the turn. Also flags
// large pastes (chat content does not cache) so they can be moved to a file.
//
// Design:
//   - Fires once per user turn (cheap, predictable).
//   - Silent unless signal is high-confidence — false positives train the user to
//     ignore the hook.
//   - Best-effort model detection from transcript tail; if unknown, still emits
//     the tier hint and lets the main thread decide.
//   - Never blocks: any error → exit 0 silently.

const fs = require('fs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function detectModel(transcriptPath) {
  // Best-effort: scan last ~50 lines of transcript JSONL for an assistant message
  // with a model field. Return canonical short name or null.
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
    const data = fs.readFileSync(transcriptPath, 'utf8');
    const lines = data.trim().split('\n').slice(-50).reverse();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const model = obj?.message?.model || obj?.model;
        if (typeof model === 'string') {
          if (/opus/i.test(model)) return 'opus';
          if (/sonnet/i.test(model)) return 'sonnet';
          if (/haiku/i.test(model)) return 'haiku';
        }
      } catch { /* skip malformed line */ }
    }
  } catch { /* ignore */ }
  return null;
}

function classify(prompt) {
  const recall = /\b(where is|where are|find (the|all|every|any)|list (all|every|the)|grep|how many|which files?|locate|search for|show me (all|every|the)|what files)\b/i;
  const transform = /\b(refactor|rename|add (a|the|an) (hook|handler|test|method|function|endpoint)|write (a |the )?(test|tests)|fix (the |this )?bug|format|convert|migrate|boilerplate|generate (a |the )?(component|class|test))\b/i;
  const reason = /\b(design|architect|architecture|trade.?off|approach|should we|why does|why is|root cause|coordinate|walk me through|explain why|pros and cons|best way to)\b/i;

  if (reason.test(prompt)) return 'Reason';
  if (recall.test(prompt)) return 'Recall';
  if (transform.test(prompt)) return 'Transform';
  return null;
}

function looksLikePaste(prompt) {
  if (prompt.length < 2000) return false;
  const newlines = (prompt.match(/\n/g) || []).length;
  const logHints = /(\bERROR\b|\bWARN\b|stack trace|Traceback|at .*\(.*:\d+:\d+\)|^\s*\d{4}-\d{2}-\d{2}T?\d{2}:\d{2})/m.test(prompt);
  return newlines > 30 || logHints;
}

function main() {
  const raw = readStdin();
  if (!raw) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const prompt = (payload?.prompt || '').toString();
  if (!prompt) process.exit(0);

  // Skip slash commands — user already chose the path explicitly
  if (prompt.trim().startsWith('/')) process.exit(0);

  const tier = classify(prompt);
  const model = detectModel(payload?.transcript_path);
  const isPaste = looksLikePaste(prompt);

  const hints = [];

  if (tier === 'Recall') {
    if (model === 'opus') {
      hints.push('[cc-efficient] Tier: Recall (lookup). On Opus — suggest /model sonnet or delegate to Explore subagent (Haiku). Apply skill rule once per task, not per turn.');
    } else if (model === 'sonnet') {
      hints.push('[cc-efficient] Tier: Recall. Consider Explore subagent (Haiku) for pure lookup work.');
    } else {
      hints.push('[cc-efficient] Tier: Recall (lookup). Cheapest model viable.');
    }
  } else if (tier === 'Transform') {
    if (model === 'opus' || model === null) {
      hints.push('[cc-efficient] Tier: Transform (apply known pattern). Sonnet handles this well at ~5x lower per-token cost than Opus. If on Opus, suggest /model sonnet once.');
    }
    // Transform on Sonnet/Haiku = correct, stay silent
  } else if (tier === 'Reason') {
    if (model === 'haiku') {
      hints.push('[cc-efficient] Tier: Reason (multi-file synthesis / trade-offs). On Haiku — suggest /model opus for design, then drop back to Sonnet for implementation.');
    } else {
      hints.push('[cc-efficient] Tier: Reason (design / trade-offs). After the design call, suggest /model sonnet for the implementation phase — do not auto-implement on Opus.');
    }
  }

  if (isPaste) {
    const kb = Math.round(prompt.length / 1024);
    hints.push(`[cc-efficient] Large paste (~${kb}KB) detected in chat. Chat content does not cache. Suggest saving to a file and using Read — file reads cache, repeat reads are near-free.`);
  }

  if (hints.length === 0) process.exit(0);

  // Emit as JSON for UserPromptSubmit so it lands in additionalContext.
  // Falls back to plain stdout if Claude Code version does not parse JSON.
  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: hints.join('\n')
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
