# CONTRIBUTING

Contributions are always welcome, no matter how large or small. Before contributing,
please read the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

### installation

- install dependencies using npm
```bash
  $ npm i
```

- you can use yarn instead
```bash
  $ yarn
```

**[install bit](https://teambit.github.io/bit/installation.html)**

perform bit import to fetch the project bit components.

```bash
  $ bit import
```

- install command globally and link (in order to use the "bit-dev" command globaly and always use the
  latest development build)
```bash
  npm run dev-link
```

if you want your command to be different then the default (bit-dev) just add your favorite command name as an argument to the script
```bash
  npm run dev-link my-bit-dev-cmd-name
```

bit will install these commands in `/usr/local/bin/` directory, so in order to remove them just use the bash `rm` command.

```bash
  rm /usr/local/bin/my-bit-dev-cmd-name
```

### Flow
- install [`flow`](https://flowtype.org/)
and make sure you have [`flow-typed`](https://github.com/flowtype/flow-typed) installed.
```bash
npm install -g flow-bin flow-typed
```

- install type definitions using flow-typed
```bash
  flow-typed install
```

### build

- build legacy and modern distributions:
```bash
  npm run build
```

- use with watch, to run the build on every code modification
```bash
  npm run watch
```

### test

- run the unit tests
```bash
  npm test
```

- run the e2e tests
```bash
  npm run e2e-test
```

### lint

- run eslint
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

## License

By contributing to Bit, you agree that your contributions will be licensed
under its [Apache2 license](LICENSE).
