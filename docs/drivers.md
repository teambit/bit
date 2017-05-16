
Bit components are language agnostic. You can write components in any language you'd like, and Bit will be able to manage them. To facilitate this behavior Bit requires a driver for each programming language, so that the components will be accessible to used in your code.

### What does the driver do?

Drivers are responsible for several tasks:

1. Resolving the `bit.json` file, and fetching all components and dependencies to the `components` directory.
2. Creating and maintainig all relevant links for the language-specific development environment, with the components imported with Bit.
  * For example - in JavaScript, to use a module via `require`, the module will need to be in the `node_modules` direcotry, so in this case the driver maintains a mock-module with links back to the `components` directory, where all components are stored.

**Important** To import and manage components use Bit-CLI. This doc only explains how to use components in your code.

In this docs we will describe all currently available drivers.

### Drivers are simply devDependencies

Bit drivers are only required when developing or building projects. They are there simply to create the virtual library. Once the virtual library is set accoring to your project's bit.json file, your application will natively use the components, just like libraries.

The only thing you need to do is to remember to pack the `components` directory alongside your project.

### Component devDependencies

Bit manages all of it's components devDependencies in it's own `components` folder, so not to interfere with your project's environment.

### Component Runtime Dependencies

When importing new components that have runtime dependencies to your code, the driver will evaluate if your runtime dependencies are met with the requirements of the component you just imported. If there is a mismatch, or your project is missing a dependency to allow the component to run, Bit will ask you to add it to your list of runtime dependencies (Bit also checks for SemVer competibility of dependencies).

### Components in Runtime

All runtime dependency resulotion of Bit components is done via the virtual API that the language-specific driver creates. This means that there are no special steps you need to take when running applications that using Bit. Not even adding any runtime dependency.

## How Bit uses it's Drivers

When any of Bit's lifecycle commands are triggered, Bit will call the driver's `bind` hook so it will update the virtual library for the specific environment.

These are Bit's lifecycle commands.:

* create
* commit
* modify
* export
* import

The way that Bit Knows which driver it needs to look for is using the component's `language` attribute from it's [bit.json](configuring-bit.mdl#bitjson) file. Once Bit figured out which driver it needs, it will simply try to `require` for the driver in the directory that the command ran in. So if the driver is installed as a devDependency, it will be able to find it in the project's folder tree, just like any other module.

## JavaScript

Bit's first fully supported programming language is JavaScript.

You can find the bit-js driver codebase [here](https://github.com/teambit/bit-js).

### JavaScript Virtual Library

All your project dependencies for your project are located in the `node_modules` directory. So if you are using NodeJS, you can `require` any of these dependencies. Also, any bundleing process uses the same method to pack them alongside your code, to run later on a web-browser.

To support the same method of require and bundeling, Bit-javascript creates a virtual module called `bit` within the `node_modules` directory, by generating a directory tree containing links back to the `components` directory. This way all components are requireable by NodeJS, and have auto-complete, distructuring and all other features you are used to.

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
npm install bit-javascript --save -dev
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

Bit-javascripts is able to both fetch components, and link them properly using a single command - `bitjs import`. This means that you can simply need to add Bit-js in your `package.json` file for your project, and a post-install hook to run `bitjs import`. This way, after installing all the packages (including bit-js), bit-js will be able to bring all components and link them, so your code will be able to require them.