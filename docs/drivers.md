# Drivers

Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?

The driver is responsible for a language specific tasks. It gets called upon specific events, for now, when creating, committing, exporting and importing components.

For example, when importing a component, Bit downloads them to the 'components' directory. However, in order for a programing lanuage to recognize and work with this directory, some work needs to be done. 

### How to set a driver

By default the language is Javascript, to change it, edit your bit.json file and change the 'lang' attribute.


In this docs we will describe all currently available drivers.

## JavaScript

Bit's first fully supported programming language is JavaScript.

You can find the bit-js driver codebase [here](https://github.com/teambit/bit-js).

The driver makes all the changes needed in the file-system to facilitate the use of components in the code.


## Using JavaScript Components

You can use bit components in your JS code with node standard module resolution syntax.

For example, requiring a component 'is-string' inside 'utils' namespace:
```js
const isString = require('bit/utils/is-string');
console.log(isString('Hello World'));
```

Or, using the ES6 import syntax
```js
import isString from 'bit/utils/is-string';
```

Import with destructuring assignment syntax is available as well
```js
import { isString } from 'bit/utils';
``` 

You can also destructure namespaces from the bit module itself. 
```js
import { utils } from 'bit';
```

## How does the above syntax work internally?
Bit-javascript driver creates "public-api" by generating "index.js" files in the node_modules/bit directory.
These index.js files are links to the actual implementation files, which are located in "components" and "inline_components" directories.

To find the components that need public-api, the driver follows specific strategies one by one, each strategy may override the previous strategy. 
1. Components that were created locally and committed. These components are in "components" directory and not mentioned in bit.json
2. Components that are mentioned in bit.json file as dependencies and are in "components" directory.
3. Inline components, which are components located in "inline_components" directory.

### Installing bit-js

For most cases, this is not needed. The bit-js driver is already shipped with bit. It has some commands thought you might find helpful.
Bit Node driver is distributed as any other JavaScript package - using [NPM](https://www.npmjs.com/package/bit-node).

To install bit-js package, run:

```sh
npm install bit-js -s
```

This will add the bit-node package as a dependency.

## Advanced

### How to implement a new driver

1) create a new npm package "bit-driver-yourLanguage".
2) add the package as bit-bin dependency.
3) in your new package, expose an object "lifecycleHooks" with the following functions: `onCreate(component)`, `onCommit(component)`, `onExport(component)`, `onImport(components)`. It's fine to not implement them all if not needed.

Internally, bit searches for a dependency according to the "lang" attribute specified in bit.json. If the "lang" doesn't start with "bit-driver-", it adds it automatically and search with the new name. For instance, for "lang": "python", it searches for a dependency "bit-driver-python". 
 

### Runtime Dependency Resolution

// TODO
