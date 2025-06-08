# CONTRIBUTING

Thank you for your interest in improving Bit! We welcome contributions of any size.  
Before you begin, please read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

The setup process is a bit more involved than you might expect because we **dog-food** Bit: we use a previously released version of Bit to build the current codebase.

### installation

1. Install **Bit** via **bvm** (see the [installation guide](https://bit.dev/docs/getting-started/installing-bit/installing-bit)).
2. From the root of this repository, run:

```bash
  npm run full-setup
```

To expose the Bit binary in this repo as a global command, run:

```bash
  npm run dev-link
```

The default binary is "bit-dev".
Want a different alias? Pass the desired name as an argument:

```bash
  npm run dev-link bd
```

Aliases are placed in `/usr/local/bin/`. Remove one with:

```bash
  rm /usr/local/bin/<alias-name>
```

### Build

- build bit code

```bash
  bit compile
```

### Watch

For faster feedback, keep the watcher running instead of rebuilding after each change:

```bash
  bit watch
```

Linux users: If you hit “System limit for number of file watchers reached”, raise the limit:

```bash
  echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
```

If you use VS Code with the Bit extension, you can configure it to compile on file changes instead of running bit watch.

### End to End Tests

Running the full e2e suite locally can take hours. It’s usually faster to push a PR and let CircleCI handle it (tests run in parallel there).

- run e2e tests with the default bit binary

```bash
  npm run e2e-test
```

- Run e2e tests with the bit-dev alias

```bash
  npm run e2e-test --bit_bin=bit-dev
```

- Debug mode: keeps workspaces and prints output

```bash
  npm run e2e-test:debug
```

### Debugging

- Stack traces are written to debug.log (macOS: ~/Library/Caches/Bit/logs/debug.log).
- For verbose logging, prefix any Bit command with BIT_LOG=\*. (For now, this helps to get more info about why a component is shown as modified and it also shows the events for `bit watch`).
- To print logs to the console at a specific level, prefix your command with `BIT_LOG=<debug-level>`, e.g. `BIT_LOG=error`.
- The log level written to the log file is by default "debug". To change it, run `bit config set log_level <level>`, e.g. `bit config set log_level info`. The options are ['trace', 'debug', 'info', 'warn', 'error'].
- Locate debug.log at any time with: `bit globals`.

### Linting

Run ESLint and tsc (for type checking)

```bash
  npm run lint
```

## Pull Requests

1. Fork the repo and create your branch from `master`.
2. Add or update tests when your code needs them.
3. Ensure tests and linting pass locally — or rely on CircleCI to do it for you.

## Understanding the Codebase

### Bootstrap flow

1. A user runs a Bit command.
2. Bit builds a graph of all core-aspects plus any aspects listed in `workspace.jsonc`.
3. After the graph is ready, Bit loads every aspect (calls its provider), so they’re all instantiated in memory.
4. Aspects register CLI commands via `cli.register()`. All aspects must load before command parsing so each command is available.
5. Bit uses **yargs**: it registers every Command instance, parses the CLI input, and executes either `report()` (plain text), `json()`, or `wait()` (for long-running tasks).

### Workspace

- Stores component locations in .bitmap.
- Stores user configuration (e.g., environments) in workspace.jsonc.
- Adding components, whether with `bit add` or `bit create`, affects only the workspace; the scope remains untouched.

### Scope

- The model / objects. The scope root is located at `<workspace-root>/.bit` or `<workspace-root>/.git/bit`.
- When a new component is tagged/snapped, Bit compresses the component files and save them along with metadata about the component in the scope.
- File names are content hashes—similar to Git’s object store.

For more details, see components/legacy/scope/README.md.

## License

By contributing to Bit, you agree that your contributions will be licensed
under its [Apache2 license](LICENSE).
