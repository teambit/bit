---
name: bit-cli
description: Bit CLI command reference with all flags and options. Use this skill BEFORE running any bit command to get the correct syntax, flags, and arguments. Covers all bit commands including snap, tag, export, import, install, status, compile, test, add, remove, and 100+ more.
---

# Bit CLI Reference

This skill provides accurate command syntax for the Bit CLI. **Always use the lookup script before running bit commands** to avoid trial-and-error with flags.

## Usage

To find the correct syntax for any bit command:

```bash
~/.claude/skills/bit-cli/bit-cli-lookup <command-name>
```

### Examples

```bash
# Get snap command syntax
~/.claude/skills/bit-cli/bit-cli-lookup snap

# Get tag command syntax
~/.claude/skills/bit-cli/bit-cli-lookup tag

# Get export command syntax
~/.claude/skills/bit-cli/bit-cli-lookup export

# Search for commands containing "env"
~/.claude/skills/bit-cli/bit-cli-lookup env

# List all available commands
~/.claude/skills/bit-cli/bit-cli-lookup --list
```

## Important Notes

- The lookup returns the exact flags with short (`-m`) and long (`--message`) forms
- Subcommands are included (e.g., `env set`, `env get`, `lane merge`)
- Arguments show whether they're required `<arg>` or optional `[arg]`
- Always check before using unfamiliar flags

## Common Commands Quick Reference

| Command   | Description                       |
| --------- | --------------------------------- |
| `snap`    | Create a snapshot (dev version)   |
| `tag`     | Create a semver release version   |
| `export`  | Push components to remote scope   |
| `import`  | Pull components from remote scope |
| `install` | Install dependencies              |
| `status`  | Show workspace status             |
| `compile` | Compile components                |
| `test`    | Run component tests               |
| `build`   | Run full build pipeline           |
| `add`     | Track new components              |
| `remove`  | Remove components                 |
| `lane`    | Work with lanes (branches)        |
