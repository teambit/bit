# Getting Started

**This quick guide will take you through the basics of working with Bit:**

* [Creating a Bit component](#create-your-first-code-component)
  * [Using it in your code](#use-the-bit-component-in-your-code)
  * [Committing your component to a local Scope](#commit-your-code)
* [Exporting a component to a remote Scope](#setup-a-remote-scope)
* [Importing a component](#import-a-component)
* [Modifying a component](#modify-a-component)
* [Using a compiler](#use-a-compiler)
* [Testing a component](#test-a-component)
* [Searching and finding components](#find-a-component)

## Before we start

1. [verify that node.js is installed](https://nodejs.org)

2. [verify that bit is installed](installation.md)

3. [configure you identity](configuring-bit.md#your-identity)

## Create your first code component

**Create a local scope**

Bit uses [Scopes](https://teambit.github.io/bit/bit-scope.html) to store, organize and manage components. Local scopes are created for your projects. Components exported to remote scopes can be used across projects. It's recommended to create the scope at the root of a project.

**Type the following in the command line.**

* `mkdir hello-world` Create an empty directory.

* `cd hello-world`

* `bit init` Initialize an empty scope.

This generates a `bit.json` file and a `.bit` directory.

You can read more about the [local scope here](glossary.md#local-scope).

### Create a Bit component

[Bit components](glossary.html#component) are organized and managed in scopes. To create your first Bit component go to a project with a bit scope in it (or create one by using `bit init` in a directory).

1. Create a Bit component:

`bit create is-string`

This creates an implementation file in the [inline_components](glossary.md#inlinecomponents) directory.

* Bit components contain a minimum of one `impl.js` file and may contain two additional files: `spec.js` and `bit.json` - [component](glossary.html#component).

2. Write the component's implementation in the `impl.js` file created for the component.

`open ./inline_components/global/is-string/impl.js`

You can copy and paste this example:

```js
  module.exports = function isString(val) {
    return typeof val === 'string';
  };
```

* You can see the status of all the components in your project using: `bit status`.

* A `component-id` is built from `<namespace>/<name>` but you can refer to a component without the `namespace` if it's in the `global` namespace.

#### Use the Bit component in your code

Bit designed to be language agnostic, so in order to use the components, you first need to install a [language-specific driver](drivers.md) for Bit. This is to enable each specific programming language to be able to use components.

1. Install the bit-javascript driver using [NPM](https://www.npmjs.com/package/bit-js) or Yarn, and add it as a development dependency.

`npm install bit-javascript --save -dev`

2. Create a file - `touch index.js && open index.js`, and paste in this code:

```js
const isString = require('bit/global/is-string'); // <component-id>

console.log(isString('It\'s the bit')); // true
console.log(isString(1)); // false
```

3. Now run the application `node index.js`.

#### Commit your code

Our goal is to use a component in our future work. Before exporting it to a remote scope, it needs to be committed from your inline_components to your local scope.

1. `bit commit is-string 'initial commit'`

* Your component moved from the `inline_components` directory into the `components` directory.

* You can view the component you just added to your scope: `bit show @this/is-string`

* When you perform a commit, Bit creates an immutable object with your identify as the Author, you can verify it with the following command - `bit log @this/is-string`. If you don't see your identity please [configure you identity](configuring-bit.md#your-identity)

* Use `bit status` to get a clear view of all components in your local scope.

```
Summary

mkdir <scope-name> && cd <scope-name>
bit init
npm install bit-javascript --save -dev
bit create <component-id>
open ./inline_components/<component-id>/impl.js // write some code in impl.js
bit commit <component-id> 'initial commit'
```

## Setup a Remote Scope

Create and use as many [remote scopes](bit-on-the-server.md) as you need to distribute your code, to be later reused across projects and development teams.

### Create a remote scope

You can host a scope on any POSIX machine (you can host multiple scopes on the same machine/VM). All remote communication is done over SSH.

Follow these steps to host your own scope:

1. [Verify that bit is installed.](installation.md)

2. Create a directory on your machine. `mkdir scopy && cd scopy`

3. Initialize a bare Bit scope in the new folder. `bit init --bare`

That's it, the scope is ready, next we need to register it as a remote scope.

### Add the new scope to your remotes list

If you are in the scope directory use `pwd` and copy the current working directory to the clipboard.
We will refer to it as `<path/to/scope>`

In your own development machine, use the `remote` command to add the new remote scope to your project.

`bit remote add file://</path/to/scope> --global`

You can check your registered remotes with the `bit remote` command.

-------------------------------------------------------------------

* You can also add a scope from another machine via ssh.

`bit remote add ssh://user@server</path/to/scope> --global`

* Important note about ssh!

`ssh://user@server</path/to/scope>` === `/path/to.scope`

`ssh:///path/to/scope>` === `/path/to.scope`

* If you don't use the `--global` flag, the remote is added to a specific project.

`bit remote add ssh://user@server</path/to/scope>`

## Export a component

Exporting your components to a remote scope enables reusability. It allows you and others to import them from a different repositories and modify them when needed.

**Important -  If you don't have a remote scope yet, please create one on [Setup a remote scope](#setup-a-remote-scope)**

Go back to the 'Hello-world' directory, where you first created your component and committed it. Now Export the component to the remote scope using `bit export @this/is-string @scopy`

* assuming that you created `@scopy` in the [initial setup chapter](initial-setup.md#create-remote-scope)

* Your component exported from the local scope, but it is still in the components directory, and available for requiring in the project. it also adds it to the bit.json file as a dependency.

* you can use `bit list @scopy` and `bit show @scopy/is-string` to verify that your component exported correctly.

```
summary

bit export @this/<component-id> <remote-scope-name>
```

## Import a component

Open a new directory somewhere else.

`mkdir different-project && cd different-project`

Create a new scope

`bit init`

Install the JavaScript driver

`npm install bit-javascript --save -dev`

import the component and save it in bit.json file.

`bit import @scopy/is-string --save`

You can see that the component was exported to the project. (located in the components directory).

Now you can simply require your component, and use it

```js
const comp = require('bit/<component name>')
```

```
Summary

mkdir <different-project> && cd <different-project>
bit init
npm install bit-javascript --save -dev
bit import <@remote-scope>/<component-id> --save
```

## Modify a component

First, a few notes about versioning - Bit doesn’t use semantic versioning. Instead, it supports only incremented component versioning. For example, the first version of a component will be 1, the second will be 2 and so forth.

### Let's say we want to add documentation to the component we've just created.

1. Import the component to the inline_components directory:

`bit modify @scopy/is-string`

The component is also in the staging area as you can see by typing `bit status`.

When you'll commit it, the version will increment itself.

2. Open the impl.js file and make some changes. you can also copy and paste the following code.

`open ./inline_components/global/is-string/impl.js`

<pre>
  <code class="js language-js">
  /**
  * determines whether `val` is a string.
  * @name isString
  * @param {*} val reference to test.
  * @returns {boolean}
  * @example
  * ```js
  *  isString('') // => true
  *  isString(1) // => false
  * ```
  */
  module.exports = function isString(val) {
    return typeof val === 'string';
  };
  </code>
</pre>

3. Commit the changes you have made to the component to your staging area.

`bit commit is-string "added documentation"`

4. Now the component is ready to be updated in the remote scope. export it.

`bit export @this/is-string @scopy`

Your changes will be published to the remote scope as a new version for the same component.
Verify the version change with show command.

`bit show @scopy/is-string`

* you can read more about js-doc parsing [Here](advanced.md#js-docs-parsing "learn more about how to write documentation for components")

```
Summary

bit modify <component>
open ./inline_components/<component-id>/impl.js // make some changes
bit commit <component>
bit export @this<component> <remote-scope>
```

## Use a compiler

1. Import the [Babel environment](https://bitsrc.io/bit/envs/compilers/babel) to your local scope, and set it as default to all newly created components:

`bit import bit.envs/compilers/babel --compiler --save`

2. Modify `bit modify @scopy/is-string`.

3. Add the compiler to the component's bit.json `open inline_components/global/is-string/bit.json`

* Copy and paste the following:

```
{
    "sources": {
        "impl": "impl.js",
        "spec": "spec.js"
    },
    "env": {
        "compiler": "bit.envs/compilers/babel::latest",
        "tester": "none"
    },
    "dependencies": {},
    "packageDependencies": {}
}
```

2. Open the impl.js file: `open inline_components/global/is-string/impl.js`

3. Make some changes in the impl.js file. you can also copy and paste the following code.

<pre>
  <code class="js language-js">
  /**
  * determines whether `val` is a string.
  * @name isString
  * @param {*} val reference to test.
  * @returns {boolean}
  * @example
  * ```js
  *  isString('') // => true
  *  isString(1) // => false
  * ```
  */
  module.exports = val => typeof val === 'string';
  </code>
</pre>

* you can check the compiled file by using `bit build -i is-string`.

4. Commit the component `bit commit is-string "add babel compiler"`.

5. Export to a remote scope `bit export @this/is-string @scopy`.

```
Summary

bit import <compiler-id> --compiler --save
bit modify <remote-scope>/<component-id>
open inline_components/<component-id>/bit.json // add compiler
open inline_components/<component-id>/impl.js // make some changes
bit commit <component-id> "<commit-message>"
bit export @this/<component-id> <remote-scope>
```

## Test a component

1. Import the [Mocha environment](https://bitsrc.io/bit/envs/testers/mocha) to your local scope, and set it as default to all newly created components:

`bit import bit.envs/testers/mocha --tester --save`

A tester enables you to test your components, read more about it [Here](glossary.md#tester)

2. Modify `bit modify @scopy/is-string`.

3. Create a spec.js in the component directory file using `touch inline_components/global/is-string/spec.js`.

4. Open the spec.js file: `open inline_components/global/is-string/spec.js`

5. Paste this implementation or write tests of your own:

```js
const expect = require('chai').expect;
const isString = require('./impl');

describe('#isString()', () => {
  it('should return true if `foo` is passed', () => {
    expect(isString('foo')).to.equal(true);
  });

  it('should return false if `1` is passed', () => {
    expect(isString(1)).to.equal(false);
  });

  it('should return false if `[]` is passed', () => {
    expect(isString([1])).to.equal(false);
  });
});
```

* you can't use node modules like you would normally do, because the component should be exported to an isolated environment and run the specs there. you can only require the modules that the tester provides.

6. Add the tester to the component's bit.json `open ./inline_components/global/is-string/bit.json`

* Copy and paste the following:

```
    {
        "sources": {
            "impl": "impl.js",
            "spec": "spec.js"
        },
        "env": {
            "compiler": "bit.envs/compilers/babel::latest",
            "tester": "bit.envs/testers/mocha::latest"
        },
        "dependencies": {},
        "packageDependencies": {}
    }
```

7. Run the component's specs `bit test --inline is-string`.

8. Commit the component `bit commit is-string "add unit tests"`.

9. Export to a remote scope `bit export @this/is-string @scopy`.

```
Summary

bit import <tester-id> --tester --save
bit modify <remote-scope>/<component-id>
touch inline_components/<component-id>/spec.js // create spec file
open inline_components/<component-id>/spec.js // add specs
open inline_components/<component-id>/bit.json // add tester
bit test --inline <component-id>
bit commit <component-id> "<commit-message>"
bit export @this/<component-id> <remote-scope>
```

## Find a component


You can find components using the ‘search’ command.

1. To search a component in your local scope, type:

  `bit search search_query -s @this`

  * Note that the search will only find components that have already been committed.

  For example, create the bit 'is-string' in the scope ‘my_scope’.

    $ bit create is-string

  Then commit it:

    $ bit commit is-string "initial commit"

  Then search for it:

    $ bit search is-string -s @this

  Output:

      > global/is-string


2. You can also search components on remote scopes (scopes that are located on a remote server). To do this, type:

    bit search search_query -s @scope_name

  For example:

    $ bit search is-string -s @my_remote_scope

  Output:

    > global/is-string

3. A third option is to search for public components. All public components are hosted in [www.bitsrc.io](https://www.bitsrc.io).

  To search public components type:

    bit search search_query

  For example:

    bit search is string

  Output:

    > bit.utils/global/is-string

  Read more about Bit search under [Discoverability](https://teambit.github.io/bit/bit-scope.html#discoverability).
