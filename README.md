# cc-efficient

Tiered-model workflow plugin for Claude Code. Routes work to the cheapest model that won't degrade quality, enforces cache + session hygiene, and helps Pro/Max plans last longer without losing output quality.

## What it does

When activated, Claude Code:

- **Classifies every task** as Recall (Haiku) / Transform (Sonnet) / Reason (Opus) and routes to the right model
- **Auto-classifies prompts** via a `UserPromptSubmit` hook that injects a one-line tier hint into context before each turn — fires once per turn, silent on ambiguous prompts and slash commands
- **Suggests model switches** when the main thread is over-provisioned (e.g. running grep on Opus)
- **Delegates pure search/lookup** to Haiku-tier subagents instead of the main thread
- **Flags large pastes** — when a prompt looks like a pasted log (>2KB with log markers or many newlines), suggests saving to a file since chat content does not cache
- **Flags cache and session hygiene issues** — long sessions, mid-session `CLAUDE.md` edits, missing `.claudeignore`
- **Enforces custom-agent design rules** when you build new agents (single responsibility, pinned `model:`, restricted tools)

The skill is content-only — no opinions about *what* you build, just *how the model resources are spent* building it.

## Install (per developer)

Each team member runs these in Claude Code:

```
/plugin marketplace add Kilowott-HQ/cc-efficient
/plugin install cc-efficient@cc-efficient
```

To activate during a session: type `/efficient`.

## Activation

The skill activates when:

- The user types `/efficient`
- The user asks "how should I approach X" or "what's the cheapest way to do Y"
- The user says "save tokens", "be efficient", "optimize my usage"
- A long session shows signs of cache decay

To deactivate: say "stop efficient" or "normal mode".

## What's inside

```
cc-efficient/
├── .claude-plugin/
│   ├── plugin.json             # plugin manifest (registers SessionStart + UserPromptSubmit hooks)
│   └── marketplace.json        # marketplace entry for sharing
├── hooks/
│   ├── cc-efficient-prime.js     # SessionStart hook — primes Claude (does NOT load full skill)
│   └── cc-efficient-classify.js  # UserPromptSubmit hook — classifies each prompt and injects a tier hint
├── skills/
│   └── efficient/
│       └── SKILL.md            # the skill — instructions Claude follows when active
└── README.md
```

**Three-stage activation:**
1. **SessionStart hook** runs once per session and emits a one-line priming message — Claude becomes *aware* the `efficient` skill exists. Negligible context cost.
2. **UserPromptSubmit hook** runs on every user turn, regex-classifies the prompt into Recall / Transform / Reason, best-effort detects the current model from the transcript, and injects a one-line tier hint into context. Silent on slash commands and ambiguous prompts so it does not become noise.
3. **Skill loads** only when Claude detects the task needs the full ruleset (tieiable work, cache hygiene issues, or explicit `/efficient` invocation). The full SKILL.md content does not load until then.

This is the "best of both" pattern: every session starts knowing the skill is available, every turn gets a cheap classifier nudge, but the full ruleset only loads when actually relevant — keeping context lean.

## Customising for your team

Fork the repo, edit `skills/efficient/SKILL.md`, push. Areas worth team-specific tuning:

- **`.claudeignore` template** — add framework-specific ignores (Laravel `storage/`, Rails `tmp/`, etc.)
- **Custom-agent design rules** — if your team has its own agent conventions, add them
- **Anti-patterns** — when you find a new way the team accidentally burns tokens, add it to the list

## Companion file: CLAUDE-USAGE.md

The skill is what *Claude* follows. The repo also includes a human-readable team playbook at [`CLAUDE-USAGE.md`](./CLAUDE-USAGE.md) — that's what people read to understand *why* the skill works the way it does. Keep both in sync when one changes.

## Related tools

- **[caveman](https://github.com/JuliusBrussee/caveman)** — token-compressed output mode. Pairs well: `caveman` cuts output tokens, `cc-efficient` cuts input + cache + model-tier waste.

## Author

[AJ - Kilowott](https://github.com/ajajrajguruKW)

## License

MIT — fork freely.
