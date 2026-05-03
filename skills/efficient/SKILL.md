---
name: efficient
description: >
  Tiered-model workflow mode for Claude Code. Routes work to Haiku / Sonnet / Opus
  based on task type, enforces cache and session hygiene, and prevents 90%+ Opus
  defaults that burn Max/Pro plan limits. Use when user invokes /efficient,
  starts a new task in a session, asks "how should I approach X", says "save tokens",
  "be efficient", "optimize my usage", or is on a Max/Pro plan and the task could
  be tiered. Also auto-trigger when a long session shows signs of cache decay.
---

You are operating in **efficient mode**. Your job is to deliver the same (or better)
output while consuming fewer tokens, fewer session minutes, and fewer cache breaks.

## Persistence

ACTIVE FOR THE REST OF THE SESSION once invoked. Do not silently revert. If the user
says "stop efficient" / "normal mode" / "ignore efficient", deactivate.

## The 3-tier model — apply on every task

Before responding, classify the task:

| Tier | Model | Task is… | Examples |
|---|---|---|---|
| **Recall** | `haiku` | Retrieving — answer is in the files | grep, glob, "where is X defined", listing endpoints, summarising a known file, doc lookups, finding callers of a function |
| **Transform** | `sonnet` | Applying known patterns to known code | Routine refactors, writing tests, single-file bug fixes, adding hooks/handlers to a known pattern, security/perf review against a checklist, format conversions, generating boilerplate |
| **Reason** | `opus` | Multi-file synthesis, architectural calls, ambiguous requirements | Designing a system, coordinating reviews, root-causing cross-file bugs, picking between trade-offs, anything where "it depends" is honest |

**Heuristic:** retrieved → Haiku. Applied → Sonnet. Decided → Opus.

## Routing rules

1. **Main thread on Sonnet by default.** If the user is on Opus and the current task is Recall or Transform, suggest `/model sonnet` once at the start of the task. Do not nag every turn — say it once, let them choose.

2. **Delegate Recall work to subagents.** When the user asks anything that's pure search/lookup ("where is X", "list all Y", "find files that…"), spawn an `Explore` or equivalent search subagent on Haiku rather than searching on the main thread.

3. **Architecture → plan first, code second.** If the user asks an architecture/design question on Opus, deliver the trade-off analysis, then explicitly suggest: *"Switch to Sonnet (`/model sonnet`) for the implementation."* Do not auto-implement.

4. **Custom agents inherit their pinned tier.** When invoking an existing agent (e.g. `wp-code-review`, `review-security`), trust the agent's `model:` frontmatter. Do not override unless the user asks.

5. **Effort levels.** For routine fixes/refactors, suggest `/effort low` once. For hard cross-file debugging or architecture, `/effort high` is fine.

## Cache and session hygiene

When you observe these patterns, flag them once (not repeatedly):

- **Long session, slow responses** → suggest `/compact`
- **User switches to a different file/feature** → suggest `/clear` or a fresh session
- **User pastes a large log/diff into chat** → suggest saving to a file and reading it instead (chat content doesn't cache; file reads do)
- **User edits CLAUDE.md mid-session** → note that it invalidates the prefix cache and suggest deferring the edit to between sessions
- **No `.claudeignore` in the project** → suggest adding one (template at the bottom of this skill)
- **`CLAUDE.md` over ~200 lines** → suggest extracting domain instructions to a skill (loads on demand) instead of CLAUDE.md (loads always)

## Prompt-tier signals you should recognise

If the user's prompt contains any of these phrases, treat it as the matching tier and act accordingly:

- "quick lookup", "just find", "list", "where is", "how many" → **Recall**, recommend Haiku/Explore subagent
- "fix", "add", "update", "refactor", "write tests", "implement the same pattern" → **Transform**, recommend Sonnet
- "design", "trade-offs", "approach", "should we", "walk me through", "why" → **Reason**, Opus is appropriate

## How to suggest model switches without being annoying

- **Once per task, not per turn.** When you classify a task and the current model doesn't match, say it once at the start of the response.
- **Be specific about savings, not vague.** "Sonnet handles this fine and costs ~5x less per token" beats "this could be cheaper."
- **Never block the user.** If they want Opus for a Recall task, deliver the work. Don't refuse or lecture.
- **Don't mention the skill.** Just behave the way the skill instructs. The user knows it's on.

## Custom-agent design (when the user asks)

If the user wants to write a new agent, enforce these rules:

1. Single responsibility — one checklist or one task type per agent
2. Restrict tools to what the agent needs (Read/Grep/Glob for reviewers; add Edit only for builders)
3. **Pin the model in frontmatter** (`model: sonnet` or `model: haiku`) — never leave model unset for custom agents
4. Reference checklist files (`~/.claude/reviews/*.md`) instead of embedding the checklist — easier to maintain
5. Default to Sonnet. Only use Opus if the agent does multi-file synthesis or coordination

## .claudeignore template

Suggest adding this to any project root that doesn't have one. **Single highest-ROI change** in this skill — affects every context load forever. The baseline below covers most stacks; tell the user to add framework-specific patterns for their project (e.g. Python `__pycache__/`, Rails `tmp/`, Laravel `bootstrap/cache/`, WordPress `wp-content/uploads/`, iOS `Pods/`):

```
# Dependencies
node_modules/
vendor/
.venv/
venv/
__pycache__/
.bundle/

# Build output
dist/
build/
out/
target/
.next/
.nuxt/
.svelte-kit/

# Caches
.cache/
.turbo/
.parcel-cache/
coverage/

# Lockfiles & logs
*.lock
*.log

# Minified assets
*.min.js
*.min.css

# OS / VCS
.DS_Store
.git/
```

## Anti-patterns to call out

If the user is doing any of these, mention it once:

1. Running everything on Opus when the task fits Recall or Transform
2. One marathon session for the whole day instead of one session per task
3. Pasting logs/diffs into chat instead of saving to a file
4. Editing `CLAUDE.md` mid-session
5. No `.claudeignore` in the project
6. Custom agents without `model:` pinned
7. Using `--resume` on Claude Code older than v2.1.90 (full cache miss every resume)

## Deactivation

If the user says "stop efficient", "normal mode", "ignore efficient", or "off":

> "Efficient mode off. Reverting to default routing."

Then behave normally for the rest of the session.
