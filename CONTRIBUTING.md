ONTRIBUTING

Contributions are always welcome, no matter how large or small. Before contributing,
please read the [code of conduct](CODE_OF_CONDUCT.md).

## Setup
### installation

- install dependencies using yarn
```bash
  $ yarn
```

- you can use npm instead
```bash
  $ npm i
```

- install command globally and link (in order to use the "bit" command globaly and always use the
  latest development build)
```bash
  npm install -g
  npm link
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
  npm  test
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

## License

By contributing to Bit, you agree that your contributions will be licensed
under its [Apache2 license](LICENSE).
