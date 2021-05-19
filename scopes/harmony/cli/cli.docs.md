---
description: Component-driven CLI app development.
labels: ['cli', 'component', 'ink']
---

CLI Aspect manages the commands in the CLI. New commands are registered to this aspect with the necessary data such as, command-name, description and flags. Parsing the args from the CLI is done by Commander package.

## Features

- Allow to register new commands
- Use commander commands.
- Render to stdout as string or as a React component by Ink.
