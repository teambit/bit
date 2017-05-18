# Drivers

Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?


Drivers are responsible for several tasks:

1. Importing all the component dependencies according to the `bit.json` file.
2. Creating and maintainig all relevant links for the language-specific development environment, of the components imported/created/managed by Bit..
  * For example - in JavaScript, to use a module via `import` or `require`, the module will need to be in the `node_modules` direcotry, so in this case the driver maintains a dynamic-module with links back to the `components` directory, where all components are stored.

For example, when importing a component, Bit downloads them to the 'components' directory. However, in order for a programing lanuage to recognize and work with this directory, some work needs to be done. 

In this docs we will describe all currently available drivers.

### How to set a driver

By default the language is Javascript, to change it, edit your bit.json file and change the 'language' attribute.

### Drivers are simply devDependencies

Bit drivers are only required when developing or building projects. They are there simply to create the virtual library. Once the virtual library is set according to your project's bit.json file. You'll be able to require/import the components just like you'll do from any other node module.

The driver is able to import the components for you, so it's not always a must.
I think we just need to find a solution for npm distributions.

### Component Dependencies

Bit manages all of its component's package dependencies in it's own `components` directory, so not to interfere with your project's environment.

### Component Runtime Dependencies

When importing new components that have runtime dependencies to your code, the driver will evaluate if your runtime dependencies are met with the requirements of the component you just imported. If there is a mismatch, or your project is missing a dependency to allow the component to run, Bit will ask you to add it to your list of runtime dependencies (Bit also checks for SemVer competibility of dependencies).

### Components in Runtime

Due to the fact that all Bit components are linked to th virtual directory generated, it utilizes `node module` resolution algorithm, to allow `require` and `import` them. This means that there are no special steps you need to take when running applications that using Bit. Not even adding any runtime dependency.

## How Bit uses it's Drivers

When any of Bit's lifecycle commands are triggered, Bit will call the driver's `bind` hook so it will update the virtual library for the specific environment.

These are Bit's lifecycle commands.:

* create
* commit
* modify
* export
* import

Bit knows which driver it needs to look for according to the project's language attribute from it's [bit.json](configuring-bit.mdl#bitjson) file. Once Bit figured out which driver it needs, it will simply try to `require` for the driver in the directory that the command ran in. So if the driver is installed as a devDependency, it will be able to find it in the project's node_modules directory, just like any other module.

## JavaScript

Bit's first fully supported programming language is JavaScript.

You can find the bit-javascript driver codebase [here](https://github.com/teambit/bit-js).

### JavaScript Virtual Library

All your project dependencies for your project are located in the `node_modules` directory. If you're using NodeJS, all the external dependencies for your project are located in the node_modules directory. To run this code in a web browser, you can use Webpack/browserify, which are module bundlers.

In order to support NodeJS + bundlers for web, Bit-javascript creates a virtual module called bit within the node_modules directory. This is done by generating a directory tree that contains links to the components directory. This way all components are requireable by NodeJS, and have auto-complete, distructuring and all other features you are used to.

It's important to note that the APIs that will be published to the virtual directory are only the ones listed in your project's bit.json file. So if any of your components has internal dependency (which is in the components directory), you will not have access to it via `require`.

For example, I have all these components imported to my project:

* bit.utils/array/diff
* bit.utils/global/is-string

So my virtual module will look like this:

```
› tree node_modules/bit
node_modules/bit
├── array
│   ├── diff
│   │   └── index.js
│   └── index.js
├── global
│   ├── index.js
│   └── is-string
│       └── index.js
└── index.js
```

Now, when looking at the code written in each of the `index.js` files, we will simply see a `require` statement linking back to the real implementation of the component. For example:

```
› cat node_modules/bit/array/diff/index.js
module.exports = require('../../../../components/array/diff/bit.utils/2/dist/impl.js');
```

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

## How does the above syntax actually work?

`bit-javascript` driver creates a "public-api" by generating "index.js" files in the `node_modules/bit` directory.
These index.js files are links to the actual implementation files, which are located in "components" and "inline_components" directories.

To find the components that need public-api, the driver follows specific strategies one by one, each strategy may override the previous strategy.

1. Components that were created locally and committed. These components are in "components" directory and not mentioned in bit.json
2. Components that are mentioned in bit.json file as dependencies and are in "components" directory.
3. Inline components, which are components located in "inline_components" directory.

### Installing bit-js


For most cases, this is not needed. The bit-js driver is already shipped with bit. It has some commands thought you might find helpful.
Bit Node driver is distributed as any other JavaScript package - using [NPM](https://www.npmjs.com/package/bit-node).

To install bit-javascript package, run:

```sh
npm install bit-javascript --save-dev
```

This will add the bit-node package as a dependency.

## Using JavaScript driver in a build process

If you are using Bit to manage your code components, the components are not a part of the codebase. This means that in order to populate the `components` directory (and all the links in the `node_modules`), you will need to use bitjs.

bit-javascript can both fetch components and link them using the command - `bitjs import`. If you want to automatically install the bit components dependencies after you call `npm install` or `yarn` you can add bit-javascript to your `package.json` file, and configure a post-install hook to run `bitjs import`. This way, after installing all the packages, bit-javascript will be able to import all of the components and link them.

## How to implement a new driver

1) create a new npm package "bit-driver-yourLanguage".
2) add the package as bit-bin dependency.
3) in your new package, expose an object "lifecycleHooks" with the following functions: `onCreate(component)`, `onCommit(component)`, `onExport(component)`, `onImport(components)`. It's fine to not implement them all if not needed.
