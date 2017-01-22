# bit - the reusable code component manager

Bit is a distributed code component manager.

Bit helps us build larger things out of smaller reusable components.

Bit lets you write code components once, and use them anywhere without creating code duplications or seating to publish endless micro-packages.

**Write once, use anywhere:** Bit is an open source tool for fast and easy extraction and reuse of code components. Exporting a component to your local (/team / community) scope can be done in mere seconds. Bit makes is easy to write code once, and use it anywhere. 

**Easy to maintain:** Bit makes component maintenance super easy. Features like isolated component environment, simple minor versioning and more to make maintenance much, much easier.

**Simple to find:** Bit uses a functional search and a simple yet smart scoping mechanism to easily find components created by you, your team or the community. Thanks to the component isolated environment, components can be built and run anywhere.

**Collaborate:** Bit was built to easily create, share and use components for a developer team. You can use the bitsrc servers to host your team’s scopes for both open source (free) and private code, or host your own Bit server.

**Bit currently supports JavaScript, but we plan to add drivers for more languages soon enough. Want to add your own drive for any language? We love that, feel free to contribute a driver. If you like to we can even do it together.**

## Features

* Export components is seconds using only two files: implementation and tests. This is possible thanks to Bit’s isolated component environment.
* Reuse components across repositories (anywhere) without duplications
* Publish reusable components to remote scopes to collaborate with your team / community
* Simple maintenance with a simplified minor component versioning, isolated component environment and more
* Easily find components using a smart functional search (CLI / WEB) to find and use any component 
* On-export dependency resolution: better performance and predictability 
* Only use the code you actually need - applications become lighter and faster
* Bit is distributed

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
and make sure you have [`flow-typed`](https://github.com/flowtype/flow-typed) installed.
```bash
npm install -g flow-bin flow-typed
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
