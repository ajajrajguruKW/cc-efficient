# Claude Code — Team Usage Playbook

**Goal:** get the same (or better) output from Claude Code while consuming fewer tokens, fewer session minutes, and fewer cache breaks. Same Pro/Max plan, more headroom for everyone.

> Read time: 5 min. Update freely — see "Updating this playbook" at the bottom.

---

## 1. The mental model — 3 tiers, 1 question

Before you send a prompt, ask: **"What is the model actually doing here?"** Then pick the cheapest tier that won't degrade the answer.

| Tier | Model | The task is… | Typical work |
|---|---|---|---|
| **Recall** | Haiku | Retrieving — the answer is already in the files | grep/glob, "where is X defined?", listing endpoints/routes, summarising a known file, doc lookups, finding a function's callers |
| **Transform** | Sonnet | Applying known patterns to known code | Routine refactors, writing tests, adding a hook/handler/middleware, single-file bug fixes, reviews against a checklist, generating boilerplate, format conversions |
| **Reason** | Opus | Multi-file synthesis, architectural calls, ambiguous requirements | Designing a system, coordinating reviews, root-causing cross-file bugs, trade-off decisions, "it depends" answers |

**One-line heuristic:** *retrieved → Haiku. applied → Sonnet. decided → Opus.*

---

## 2. Before you start a session — 30-second pre-flight

- [ ] **Open Claude Code at the project root**, not your home directory. The fewer files in scope, the cheaper every read.
- [ ] **Check for a `.claudeignore`**. If missing, add one (template below). Excludes dependency dirs, build artifacts, lockfiles. **Highest ROI of anything in this doc.**
- [ ] **Pick the model up front.** Default to Sonnet for routine work. Use `/model opus` only for the planning/architecture phase, then `/model sonnet` once the plan is set.
- [ ] **One task per session.** Don't carry frontend context into a backend task. Open a new session instead of context-switching.
- [ ] **If the task is search-only** (just finding things), say so in your prompt — Claude will route to a search subagent instead of doing it on the main thread.

### `.claudeignore` template
A baseline that covers most stacks. **Add framework-specific patterns for your project** (see notes below):

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

**Add for your stack as needed:**
- *Python:* `*.pyc`, `.pytest_cache/`, `.mypy_cache/`, `.tox/`
- *Ruby/Rails:* `tmp/`, `log/`, `storage/`
- *Go:* `bin/`, `*.test`
- *Rust:* `target/` (already covered)
- *PHP/WordPress:* `wp-content/uploads/`, `wp-content/cache/`
- *Laravel:* `bootstrap/cache/`, `storage/framework/`
- *Java/Kotlin:* `*.class`, `.gradle/`
- *iOS/Xcode:* `Pods/`, `DerivedData/`, `*.xcworkspace/`
- *Generated assets:* anything you'd add to `.gitignore` is usually a candidate

---

## 3. During the session — do / don't

**Do**
- `/compact` every 30–40 tool calls when the response feels sluggish
- `/clear` when switching to a different file or feature
- Edit `CLAUDE.md` **between** sessions, not during one (every edit invalidates the prefix cache)
- Tell Claude *what kind of task* it is in plain language — "this is just a lookup" / "design decision needed" / "routine fix" routes the work to the right tier
- Use skills (`.claude/skills/`) for instructions that should load **on demand**. Use `CLAUDE.md` only for things that should load **always**.

**Don't**
- Don't keep one long session running all day. Cache decays past compaction; restart for each task.
- Don't paste large logs/diffs into chat — save them to a file and ask Claude to read the file. (Pasted content burns input tokens forever; file content can be cached.)
- Don't use `--resume` on Claude Code older than v2.1.90 — full cache miss every time.
- Don't bloat `CLAUDE.md` past ~200 lines. It re-loads on every message. 12K tokens × 200 messages/day = real cost.
- Don't pile project background into the prompt. Put it in `CLAUDE.md` once, or a skill, and let it cache.

---

## 4. Prompt patterns — copy, paste, edit

These templates signal the tier so Claude routes the work correctly. Substitute the language/framework specifics for your stack.

### A. Fast lookup (Haiku tier)
```
Quick lookup — no edits. Find every place we call `userService.getById` in the API package and list the file:line. That's it.
```
*Why it works:* "Quick lookup", "no edits", and "list the file:line" all signal retrieval. Claude will use Grep/Glob and a cheap model.

### B. Routine implementation (Sonnet tier)
```
Routine task. Add a `beforeSave` hook on the `Order` model that emits a `order.updated` event. Pattern is the same as the existing `beforeDelete` hook in the same file. Don't refactor anything else.
```
*Why it works:* names the pattern to copy, scopes the change, and explicitly forbids drift.

### C. Bug fix (Sonnet tier)
```
Bug: form submission on /contact returns 403 for logged-out users. CSRF token is set in the template. Find the cause and fix only the cause — no surrounding cleanup, no extra error handling.
```
*Why it works:* gives the symptom, the suspected area, and explicitly forbids over-correction.

### D. Architecture / planning (Opus tier — but switch off after)
```
Design question. We need to add Redis caching to the user-profile endpoint. Walk me through the trade-offs of (a) write-through cache, (b) read-through with TTL, (c) cache-aside with manual invalidation. Don't write code yet — just the trade-offs and your recommendation.

After we agree on the approach, I'll switch to Sonnet for implementation.
```
*Why it works:* asks for synthesis, names the options, blocks premature implementation, and primes the next prompt to use a cheaper model.

### E. Code review (delegates to subagents)
```
Run a full review on the files in /src/api/orders/. Use our review coordinator agent so the specialists run in parallel.
```
*Why it works:* by name-checking a coordinator agent, you ensure it fans out to specialists (Sonnet) — instead of the main thread doing it all on Opus.

---

## 5. Slash commands worth memorising

| Command | When |
|---|---|
| `/model sonnet` / `/model opus` / `/model haiku` | Switching tiers mid-session |
| `/effort low` / `medium` / `high` | Drop effort for routine tasks; raise for hard problems |
| `/compact` | Every 30–40 tool calls, or when responses slow down |
| `/clear` | When switching contexts within the same session |
| `/agents` | List custom agents available in this project |
| `/efficient` | Activate the cc-efficient skill (if not already primed by the SessionStart hook) |
| `/help` | Built-in command reference |

---

## 6. Custom agents — when and how

Use a custom agent when **the same kind of task happens repeatedly** and benefits from a fixed checklist or fixed model tier.

**Common patterns that pay off (build for your stack):**
- A coordinator agent (Opus) that fans out to specialist reviewers (Sonnet) for parallel multi-aspect review
- `security-review` — language-appropriate vulnerability checks (XSS, injection, auth, secrets)
- `accessibility-review` — WCAG 2.1 AA, semantic HTML, ARIA (for any frontend)
- `performance-review` — N+1 queries, caching, asset loading (any backend/frontend)
- `api-contract-review` — REST/GraphQL schema, breaking changes, versioning
- `migration-review` — DB migrations, lock-safety, rollback paths
- `test-writer` — adds tests for a specific function/module against your test framework
- `dependency-audit` — flags outdated or vulnerable dependencies in your lockfile

**When to write a new one:** if you find yourself prompting "review this file for X" more than 3 times in a week, write an agent. The checklist lives in the agent definition; you stop re-typing it; the agent runs on the right tier automatically.

**Agent design rules:**
1. Single responsibility — one checklist per agent
2. Restrict tools to what the agent needs (Read/Grep/Glob for reviewers; Edit only for builders)
3. **Pin the model in frontmatter** (`model: sonnet` / `model: haiku`) — never leave it unset
4. Reference a checklist file in a shared folder rather than embedding it — easier to update

---

## 7. Anti-patterns — the top 5 things that quietly cost us money

1. **Running everything on Opus by default.** The main thread is the biggest single line item. If your task fits Recall or Transform, switch the model at the top of the session.
2. **One marathon session per day.** Long sessions = stale context = repeated re-uploads. Restart per task.
3. **Pasting logs/diffs into chat.** Save to a file, ask Claude to read the file. Files cache; chat content doesn't.
4. **Editing `CLAUDE.md` mid-session.** Invalidates the prefix cache for the rest of the session. Edit between sessions only.
5. **No `.claudeignore`.** Every context load reads dependency directories. Adding one file pays back forever.

---

## 8. Updating this playbook

This file is **meant to be edited.** When you find a pattern that works (or one that bit you), add it.

- Use a PR / commit so others see what changed
- Keep entries short and actionable — no theory, just the rule
- If a section grows past ~10 lines, it's probably its own skill or agent — extract it
- Stack-specific tips: add to your team's fork of this repo, or keep them in your team's internal docs — the public version stays neutral

**Owner:** team lead rotates. Whoever notices a pattern is responsible for the edit.

---

## Quick-reference card (tear-off)

```
TIER:    Recall (Haiku)  → finding/listing/summarising
         Transform (Sonnet) → routine code work
         Reason (Opus)   → architecture/synthesis

START:   project root → check .claudeignore → pick model → one task

DURING:  /compact at 30 calls → /clear to switch → no CLAUDE.md edits

END:     close session, don't keep it warm
```
