# bit - the usable code component manager
Today, finding small code components means searching the web (e.g. googling stack overflow...) and copy-pasting them across multiple repositories.
We all do it, and we all know it's bad: it creates an unmaintainable, hard to update code base with an ever growing technological debt.

The alternative, treating few lines of code as entire packages, means creating a heavy dependency tree while relying on external sources. 
We all remember the left pad story. We also know that a bigger dependency tree equals a slower build and a heavier app.

Bit's code component manager saves the need to copy-paste code components or to install entire packages for a few lines of code. 
Each code component can be easily published, found or injected into your code in seconds and without effort.

A simple code component like this: 
```js
  function padLeft (str, len, ch) {
    str = String(str);
    var i = -1;
    if (!ch && ch !== 0) ch = ' ';
    len = len - str.length;
    while (++i < len) {
      str = ch + str;
    }
    return str;
  }
  
  module.exports = padLeft;
```

Simply becomes:
```js
  bit.padLeft(str, len, ch);
```
It allows you to design lighter applications with super fast installation and a duplication-free and easy-to-maintain code base which does not depend on external sources.

## install using brew (future)
```bash
  brew install bit
```

# development

## installation

- install dependencies using yarn
```bash
  $ yarn
```

- you can use npm instead
```bash
  $ npm i
```

- install command globally and link (in order to use the "bit" command globaly and always use the latest development build)
```bash
  npm install -g
  npm link
```

## Flow
- install [`flow`](https://flowtype.org/)
```bash
npm install --global flow-bin
```

- make sure you have [`flow-typed`](https://github.com/flowtype/flow-typed) installed.
```bash
  npm install -g flow-typed
```

- install type definitions using flow-typed
```bash
  flow-typed install
```

## build

- build legacy and modern distributions:
```bash
  npm run build
```

- use with watch, to run the build on every code modification
```bash
  npm run watch
```

## test

- run the unit tests
```bash
  npm  test
```

## lint

- run eslint
```bash
  npm run lint
```