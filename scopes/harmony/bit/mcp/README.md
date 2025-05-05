# Bit CLI MCP Server

This project provides a Model Context Protocol (MCP) server for the Bit CLI, enabling programmatic and remote access to Bit workspace and component management commands. It exposes most Bit CLI commands as MCP tools, making it possible to automate, script, or integrate Bit operations with other tools and platforms.

## Features

By default, this MCP server exposes a small set of the most essential Bit CLI commands (about 20 tools) for safety and performance. If you need access to the full range of Bit CLI functionality, you can start the server with the `--extended` flag, which enables nearly all Bit CLI commands as MCP tools. This allows you to choose between a minimal, fast toolset and comprehensive Bit CLI coverage as needed.

**Note:** When using the `--extended` flag, some models may not work and could throw errors such as "Request Failed: 400 Bad Request" or "Server error: 500". If you encounter these errors, avoid using the extended mode.

## Usage

### Prerequisites
- Node.js (v18 or later recommended)
- Bit CLI installed and available in your PATH

### Using in VS Code
To use this MCP server in VS Code:
Add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open Settings (JSON)`.
```
{
  "mcp": {
    "servers": {
      "bit-cli": {
        "command": "bit",
        "args": ["mcp-server"]
      }
    }
  }
}
```

## Supported Bit CLI Commands

### Default Toolset (enabled by default)
The following Bit CLI commands are available as MCP tools without any extra flags:

- status
- list
- add
- init
- show
- tag
- snap
- import
- export
- remove
- log
- test
- diff
- install
- lane show
- lane create
- lane switch
- lane merge
- create
- templates
- reset
- checkout

### Extended Toolset (enabled with --extended)
When you start the server with the --extended flag, nearly all Bit CLI commands become available as MCP tools, including:

- All lane sub-commands (remove, alias, rename, diff, change-scope, import, fetch, eject, history, history-diff, checkout, revert, merge-abort, merge-move, etc.)
- build, lint, format, uninstall, update, recover, clear-cache, fork, rename, dependents, compile, ws-config, stash, schema, check-types, aspect, refactor, why, app, insight, deps (and all sub-commands), log-file, blame, scope, artifacts, globals, system, eject, pattern, and more.

> For a full and up-to-date list, see the implementation in `./mcp-server.ts`.
