
Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?

Drivers are responsible for several tasks:

1. Resolving the `bit.json` file, and fetching all components and dependencies to the `components` directory.
2. Creating and maintainig all relevant links for the language-specific development environment, with the components imported with Bit.
  * For example - in JavaScropt, to use a module via `require`, the module will need to be in the `node_modules` direcotry, so in this case the driver maintains a mock-module with links back to the `components` directory, where all components are stored.

**Important** To import and manage components use Bit-CLI. This doc only explains how to use components in your code.

In this docs we will describe all currently available drivers.

## JavaScript

Bit's first fully supported programming language is JavaScript.

You can find the bit-js driver codebase [here](https://github.com/teambit/bit-js).

### Installing bit-js

Bit Node driver is distributed as any other JavaScript package - using [NPM](https://www.npmjs.com/package/bit-node).

To install bit-js package, run:

```sh
npm install bit-js -s
```

This will add the bit-node package as a dependency.

# Drivers

## Using JavaScript Components

To use Bit components within your JS code you need to first link the components to the `node_modules` directory. This can be done by wither running Bitjs in 'watch' mode, by issueing `bitjs watch` command, or manually with `bit bind`, on every change.

Once all components are linked, you can simply `require` them:

```js
const isString = require('bit/is-string');
```

That's it :)

## Using JavaScript driver in a build process

If you are using Bit to manage your code components, the components are not a part of the codebase. This means that in order to populate the `components` directory (and all the links in the `node_modules`), you will need to use bitjs.

Bit-js is able to both fetch components, and link them properly using a single command - `bitjs import`. This means that you can simply need to add Bit-js in your `package.json` file for your project, and a post-install hook to run `bitjs import`. This way, after installing all the packages (including bit-js), bit-js will be able to bring all components and link them, so your code will be able to require them.

### Runtime Dependency Resolution

// TODO