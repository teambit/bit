# Bit CLI Skill for Claude Code

This skill provides Claude Code with accurate Bit CLI command reference, eliminating trial-and-error when running bit commands.

## Installation

### Quick Install (recommended)

```bash
# Create the skill directory
mkdir -p ~/.claude/skills/bit-cli

# Download the skill files
curl -sL https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/SKILL.md \
  -o ~/.claude/skills/bit-cli/SKILL.md

curl -sL https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/bit-cli-lookup \
  -o ~/.claude/skills/bit-cli/bit-cli-lookup

# Make the lookup script executable
chmod +x ~/.claude/skills/bit-cli/bit-cli-lookup

# Download the CLI reference (or let it auto-download on first use)
~/.claude/skills/bit-cli/bit-cli-lookup --update
```

### One-liner

```bash
mkdir -p ~/.claude/skills/bit-cli && cd ~/.claude/skills/bit-cli && curl -sLO https://raw.githubusercontent.com/teambit/bit/master/contrib/claude-skill-bit-cli/{SKILL.md,bit-cli-lookup} && chmod +x bit-cli-lookup && ./bit-cli-lookup --update
```

### Manual Install

1. Copy the following files to `~/.claude/skills/bit-cli/`:

   - `SKILL.md`
   - `bit-cli-lookup`

2. Make the lookup script executable:

   ```bash
   chmod +x ~/.claude/skills/bit-cli/bit-cli-lookup
   ```

3. Download the CLI reference:
   ```bash
   ~/.claude/skills/bit-cli/bit-cli-lookup --update
   ```

## Requirements

- `jq` - JSON processor (install with `brew install jq` or `apt-get install jq`)
- `curl` - For downloading updates

## How It Works

1. Claude Code automatically discovers this skill when you ask about bit commands
2. Instead of loading the full 5000+ line CLI reference, Claude runs the lookup script
3. The script returns only the relevant command info (~20-50 lines)
4. Claude uses the accurate flags without trial-and-error

## Usage (for humans)

You can also use the lookup script directly:

```bash
# Look up a specific command
~/.claude/skills/bit-cli/bit-cli-lookup snap
~/.claude/skills/bit-cli/bit-cli-lookup tag
~/.claude/skills/bit-cli/bit-cli-lookup export

# List all commands
~/.claude/skills/bit-cli/bit-cli-lookup --list

# Update to latest CLI reference
~/.claude/skills/bit-cli/bit-cli-lookup --update
```

## Keeping Updated

The CLI reference is fetched from the Bit repository. To update:

```bash
~/.claude/skills/bit-cli/bit-cli-lookup --update
```

## Troubleshooting

**"jq not found"**: Install jq with your package manager

**"CLI reference not found"**: Run `bit-cli-lookup --update` to download it

**Command not found**: Check spelling, or run `bit-cli-lookup --list` to see available commands
