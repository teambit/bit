
Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?

Drivers are responsible for several tasks:

1. Importing all the component dependencies according to the `bit.json` file.
2. Creating and maintainig all relevant links for the language-specific development environment, of the components imported/created/managed by Bit..
  * For example - in JavaScript, to use a module via `import` or `require`, the module will need to be in the `node_modules` direcotry, so in this case the driver maintains a dynamic-module with links back to the `components` directory, where all components are stored.

**Important** To import and manage components use Bit-CLI. This doc only explains how to use components in your code.

In this docs we will describe all currently available drivers.

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

### Installing bit-javasscipt

Bit Node driver is distributed as any other JavaScript package - using [NPM](https://www.npmjs.com/package/bit-node).

To install bit-javascript package, run:

```sh
npm install bit-javascript --save-dev
```

This will add the bit-node package as a dependency.

# Drivers

## Using JavaScript Components

To use Bit components within your JS code you simply need to require them (after importing them, of course)

```js
const isString = require('bit/is-string');
```

That's it :)

## Using JavaScript driver in a build process

If you are using Bit to manage your code components, the components are not a part of the codebase. This means that in order to populate the `components` directory (and all the links in the `node_modules`), you will need to use bitjs.

bit-javascript can both fetch components and link them using the command - `bitjs import`. If you want to automatically install the bit components dependencies after you call `npm install` or `yarn` you can add bit-javascript to your `package.json` file, and configure a post-install hook to run `bitjs import`. This way, after installing all the packages, bit-javascript will be able to import all of the components and link them.
