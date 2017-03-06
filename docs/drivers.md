
Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?

The driver resolves the ID of the components you want to use in your code, and using [dependency injection](https://en.wikipedia.org/wiki/Dependency_injection) run the component you want to use.

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

To use Bit components within your JS code you need to first require bit-node:

```js
const bit = require('bit-js');
```

Now it's a matter of calling the right components, like so:

```js
isString = bit('is-string');
console.log(isString('Hello World');
```

That's it :)

### Runtime Dependency Resolution

// TODO