# CONTRIBUTING

Contributions are always welcome, no matter how large or small. Before contributing,
please read the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

the setup process is more involving than expected because we write bit using bit (dogfooding), this is done by having a previous version of bit installed and using it to build the current code.

### installation

- make sure you have `bit` installed via `bvm` (see [instructions](https://harmony-docs.bit.dev/getting-started/installing-bit/)), then run:

```bash
  $ npm run full-setup:bit
```

the script does the following:

1. runs `bit install` to install all dependencies
2. runs `bit compile` to compile all components in the workspace (Harmony code).
3. compiles bit-legacy code (by `npm run build`).
4. generates the d.ts files for the bit-legacy code (by `npm run build:types`).

install command globally and link (in order to use the "bit-dev" command globally and always use the
latest development build)

```bash
  npm run dev-link
```

if you want your command to be different then the default (bit-dev) just add your favorite command name as an argument to the script

```bash
  npm run dev-link my-bit-dev-cmd-name
```

for example:

```bash
  npm run dev-link bd
```

bit will install these commands in `/usr/local/bin/` directory, so in order to remove them just use the bash `rm` command.

```bash
  rm /usr/local/bin/my-bit-dev-cmd-name
```

### Build

Depends on where your changes were made, you'll need to build the legacy code or Harmony code.
If the changes were done in `src/` directory, then it's the legacy. Otherwise, it's probably in `scopes/` directory and it's the new code.

- build bit-legacy code

```bash
  npm run build
```

- build bit Harmony code

```bash
  bit compile
```

### Watch

It's easier to leave the watch process running instead of re-build for every change.

- watch bit-legacy code

```bash
  npm run watch
```

- watch bit Harmony code

```bash
  bit watch
```

If you are using Linux and getting "System limit for number of file watchers reached" errors, increase the max number of allowed watchers:

```bash
  echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```

### Unit Tests

- run the unit tests

```bash
  npm test
```

### End to End Tests

Keep in mind that running the e2e-tests locally may take hours to complete, it's faster to create a new PR and let CircleCI run them. Circle is configured to run multiple tests in parallel and complete them much faster.

- run the e2e tests (with default 'bit' command)

```bash
  npm run e2e-test
```

- run e2e tests using bit-dev command

```bash
  npm run e2e-test --bit_bin=bit-dev
```

- run e2e-tests for debugging (shows output and doesn't delete the workspaces)

```bash
  npm run e2e-test:debug
```

- run e2e-tests for SSH (switch from exporting by using file-system to SSH approach). Make sure you are able to run 'ssh `whoami`@127.0.0.1' on your local.

```bash
  npm run e2e-test:ssh
  npm run e2e-test:ssh-debug
```

### Debugging

The code is heavy on promises, as such, some errors don't have a useful stack trace. Bluebird enables the long stack trace when the env is development or when `BLUEBIRD_DEBUG` is set. Normally, the full stack trace is not shown on the console but logged in the debug.log file. (located at /Users/your-use/Library/Caches/Bit/logs/debug.log on Mac).

In some cases, you might get very helpful info by prefixing Bit command with `BIT_LOG=*`. For now, this helps to get more info about why a component is shown as modified and it also shows the events for `bit watch`.

To print the log messages on the console, prefix your command with `BIT_LOG=<debug-level>`, e.g. `BIT_LOG=error`.

The log level written to the log file is by default "debug". To change it, run `bit config set log_level <level>`, e.g. `bit config set log_level info`.

### Lint

Run eslint and tsc (for type checking)

```bash
  npm run lint
```

## Pull Requests

We actively welcome your pull requests.

1. Fork the repo and create your branch from `master`.
2. If you've added code that should be tested, add tests.
3. Ensure the test suite passes.
4. Make sure your code lints.
5. Add your change to the CHANGELOG.md file at the [unreleased] section.

## Understanding the code

The bootstrap process (in Harmony) in general is as follows:

1. A user enters Bit command.
2. Bit builds a graph of all core-aspects and aspects entered in the workspace.jsonc file.
3. Once the graph is ready, it loads them all (calls their provider), so then all aspects instances are ready in-memory.
4. An aspect can register to the CLI slot (`cli.register()`) and pass `Command` instances. (that's the main reason why all aspects must be loaded before anything else happen. Otherwise, commands won't be registered and the user will get an error about a non-exist command)
5. `yargs` package is used for parsing the commands. All `Command` instances are registered by `yargs`. It finds the currently entered command and runs either `report()` to return a result to the CLI as plain text or `render()` to paint the output as a React component using `Ink`.

### Workspace

The user workspace. It has a .bitmap file where it stores all the components locations on the filesystem.

It also has a workspace.jsonc file where it stores the user configuration, such as what environments are used.

When the user adds a new component (using `bit add` command), it is done on the workspace part only. The files are added to the .bitmap file and it doesn't involve the scope.

### Scope

The model / objects. The scope root is located at `<workspace-root>.bit` or `<workspace-root>/.git/.bit`.
When a new component is tagged (using `bit tag` command), Bit compresses the component files and save them along with metadata about the component in the scope.

The file names are the hashes of the files/metadata. Think about it as .git in Git world.

See src/scope/README.md for more data about the scope.

## License

By contributing to Bit, you agree that your contributions will be licensed
under its [Apache2 license](LICENSE).
