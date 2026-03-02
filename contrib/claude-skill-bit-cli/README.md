# Bit CLI Skill for Claude Code

A lightweight skill that provides Claude Code with Bit CLI command reference using progressive disclosure.

## How It Works

The skill uses a two-level approach to minimize token usage:

1. **SKILL.md** (~800 tokens) - Command index with descriptions, loaded when you ask about bit commands
2. **CLI_REFERENCE.md** (~2000 tokens) - Subcommands, arguments, and flags, loaded only when needed
3. **Fallback** - `bit <command> --help` for anything not covered

No bash scripts, no permission prompts, minimal context usage.

## Installation

### Quick Install

```bash
mkdir -p ~/.claude/skills/bit-cli

curl -fsL https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/SKILL.md \
  -o ~/.claude/skills/bit-cli/SKILL.md

curl -fsL https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/CLI_REFERENCE.md \
  -o ~/.claude/skills/bit-cli/CLI_REFERENCE.md
```

### One-liner

```bash
mkdir -p ~/.claude/skills/bit-cli && cd ~/.claude/skills/bit-cli && curl -fsLO https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/SKILL.md && curl -fsLO https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/CLI_REFERENCE.md
```

## What's Included

### SKILL.md (Level 2 - loaded when triggered)

- All public commands organized by category
- One-line descriptions
- Auto-generated from `bit cli generate --skill commands`

### CLI_REFERENCE.md (Level 3 - loaded on demand)

- Full command reference with subcommands, arguments, and flags
- Auto-generated from `bit cli generate --skill reference`
- Fallback to `bit --help` for more details

## Token Usage

| Scenario                | Tokens Used       |
| ----------------------- | ----------------- |
| Skill metadata (always) | ~100              |
| Command lookup          | ~800              |
| Need reference details  | ~800 + ~2000      |
| Edge case               | Uses `bit --help` |

## Keeping Updated

```bash
cd ~/.claude/skills/bit-cli
curl -fsLO https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/SKILL.md
curl -fsLO https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/CLI_REFERENCE.md
```

## Regenerating (for Bit developers)

The skill files are auto-generated from the Bit CLI:

```bash
# Generate command list (SKILL.md body)
bit cli generate --skill commands

# Generate command reference (CLI_REFERENCE.md)
bit cli generate --skill reference
```

## Alternative: Full MCP Server

For a more comprehensive solution with real-time command discovery, consider using the Bit MCP server instead:

```bash
bit mcp-server setup claude-code
```

The MCP server provides dynamic access to all commands but requires more resources.
