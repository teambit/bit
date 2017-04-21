
Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?

The driver is responsible for a language specific tasks. It gets called upon specific events, for now, when creating, committing, exporting and importing components.

For example, when importing a component, Bit downloads them to the 'components' directory. However, in order for a programing lanuage to recognize and work with this directory, some work needs to be done. 

### How to set a driver

By default the language is Javascript, to change it, edit your bit.json file and change the 'lang' attribute.

### How to implement a new driver

1) create a new npm package "bit-driver-yourLanguage".
2) add the package as bit-bin dependency.
3) in your new package, expose an object "lifeCycleHooks" with the following functions: `onCreate(component)`, `onCommit(component)`, `onExport(component)`, `onImport(components)`. It's fine to not implement them all if not needed.

Internally, bit searches for a dependency according to the "lang" attribute specified in bit.json. If the "lang" doesn't start with "bit-driver-", it adds it automatically and search with the new name. For instance, for "lang": "python", it searches for a dependency "bit-driver-python". 
 

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
