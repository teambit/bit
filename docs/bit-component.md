
# What is a Bit component?

A component is Bit's most fundamental entity. A code component is a testable and a reusable definition of a 
certain atomic functionality that handles a single and a well-defiend responsibility.

It can be almost anything, from a function, class, object, array, string to a React or an AngularJS component.

Bit's component was designed with testability and simplicity in mind, our goal was to make it as simple as it 
gets to create, maintain, test and discover code components.

* ***Creation simplicity*** - 
  Creating a component requires only one mandatory file which is the implementation file itself 
  (tests and configration are optional). 
  Transpiling, testing, docs and other boilerplate mechanics can be set using the [component environment](#component-environment).
* ***Maintainable*** - 
  [Automatic versioning](#component-versioning), a [slim built-in Scope CI mechanism](bit-scope.md#scope-ci) 
  and a [dependency management mechanism](bit-scope.md#dependency-resolution-and-management) designed to center performance, consistency and predictability. 
* ***Discoverable*** - 
  Each component is indexed and made fully discoverable by a natural-language search that aimes to understand and cluster components by its functionality.
  See our [Scope Discoverability](bit-scope.md#discoverability) section for more information.

## Component's Anatomy

A Bit component's most fundamental and only mandatory file is the implementation file named `impl.js` (default name).
The implementation file consists the component implementation itself and its docs which are parsed to form 
the entire component documantation (see [Component Documentation](#component-documantation) section for more info).

On top of the implmantation file, two more optional files can be added:

1. `spec.js` - 
  contains the component's unit tests, designated to be executed by the configured [Testing Environment](#testing-environment).
2. `bit.json` - 
  Configuration file for handling of dependencies, environment, naming conventions and more.

Please note, component file names can be configured via [bit.json](configuring-bit.md#bitjson), `spec.js` and `impl.js` are the default names.

### Component Example

`impl.js` - includes the implmantation itself with its docs (later to be parsed and form the component's documantation).
```js
/**
 * determines whether `val` is a reference
 * @name isString
 * @param {*} val value to be tested.
 * @returns {boolean} 
 * @example
 *  isString('') // => true
**/
module.exports = function isString(val) {
  return typeof val === 'undefined';
}
```

`spec.js` - includes unit tests implmented using Mocha and Chai executed by the defined testing environment.
```js
import { expect } from 'chai';

const isString = require(__impl__);

describe('#isString()', () => {
  it('should return false if undefined is passed', () => {
    expect(isString()).to.equal(false);
  });

  it('should return true if string is passed', () => {
    expect(isString('foo')).to.equal(true);
  });
});
```

`bit.json` - configured to handle test execution with Mocha and transpiling with Babel. 
(Please note, this configuration can be specified)
```json
{
    "env": {
        "compiler": "bit.envs/compilers/babel", // Traspiler component for implementation and unit tests files
        "tester": "bit.envs/testers/mocha" // Testing environment component for unit test execution
    },
    "dependencies": {
      "@scope/is-string": "1" // specify component dependencies (they will be resolved upon export) 
    },
    "packageDependencies": {
      "user-home": "^2.0.0", // set package dependencies if needed
    } 
}
```

# Component ID

Bit components are universally and uniquely identified using a Bit ID to support the distributed nature of a Scope.

We designed the component ID to make it easy for developers to create and maintain code components without the need to resolve different naming conflicts and to enable semantic organization of code components on a Scope. 

Each Bit component has its own ID which is a composition of the scope name, namespace and name of the component.

```
@<scope>/[namespace]/<name>
```

For example, a component named `string/is` stored in a Scope named `foo` would have the following ID:

```
@foo/string/is
```

In case the component's source is stored on your local scope, you can also use the `@this` annotation as a syntactic-sugar to reference it.

```
@this/string/is
```

To reference a component which was not committed to any scope yet and exists within the `inline_components` directory,
just ignore the scope name.

```
string/is
```

In this case, Bit will look for a directory named `string` with a component directory named `is` in your `inline_components` directory.

A component ID may also include a specific version using the `::` annotation.
For example, a reference to a component named `is-string` on Scope `foo` in version `2` could be done like that:

```
@foo/is-string::2
```

## Global namespace

When creating a component without a namespace, it will be automatically assigned to the `global` namespace.
For example, a component named `is-string` created without a namespace on your local scope, can be addressed in two different ways.

Explicitly reference the global namespace
```
@this/global/is-string
```

Implicitly reference the global namespace to make names shorter.
```
@this/is-string
```

# Component Configuration
Bit components are configured via a configration file named [bit.json](configuring-bit.md#bitjson).

For more information, please check out the [bit.json](configuring-bit.md#bitjson) documantation section.

# Component Versioning

In Bit, versions are automatically assigned to a component once its commited (using `bit commit`) to a Scope using a simple and automatic versioning mechanism.

Once a component is commited from the `inline_components` directory to a Scope, Bit checks whether a version of this component exists and does one of the following:
1. Component exists - Bit will uptick components version by one.
2. New component (component does not exists on scope) - A new component would be created.

Bit handles small code component with a single responsibility, not large packages. Such components simply tend to change less often. This made us favor strict versioning over SemVer and automatic updates. We value reliability and stability.

# Component Documentation

Documentation for packages is not fun, but if you want your code to be truely reuseable, other developers will need to have a place to learn how to use your code. We beleive that the best place to tell people how to use your code, is... well.. alongside your code. This way, when you distribute code components, and even open a code component to review its code, the usage instruction are there (!).

This is no magic. To do this, bit utilize the 'Xdoc' format for annotating everything as a part of yoru code.

Let's take JavaScript for example.

JavaScript uses [JSDocs](http://usejsdoc.org) to create documentation on JS code. Bit knows how to read these docs, and parse them in a way that gives other users a formatted view of them, to better understand what to expect from the component before even using it.

### How does it work in real life?
Let's imagine a `pad-left` function, and write the JSdocs:

```js
/**
 * pad a string to the left.
 * @name leftPad
 * @param {string} str string to pad
 * @param {number} len total 
 * @param {string} ch char to use for padding
 * @returns {string} modified string
 * @example
 * ```js
 *  leftPad('foo', 5) // => "  foo"
 *  leftPad('foobar', 6) // => "foobar"
 *  leftPad(1, 2, '0') // => "01"
 * ```
 */
```

When exporting the component to a scope, Bit will parse the annotations, and create a proper documentation from it. Furthermore, Bit will use the documentation to index the component, so when searching for components, a better documented code component will be more discoverable by other users.

To view the docs for a component you can either open the code, or use the `show` command (which also works on [remote scopes](bit-scope.md)).

```sh
› bit show string/pad-left
┌────────────────────┬──────────────────────────────────────────────────┐
│ Name               │ leftPad                                          │
├────────────────────┼──────────────────────────────────────────────────┤
│ Description        │ pad a string to the left.                        │
├────────────────────┼──────────────────────────────────────────────────┤
│ Args               │ (str: string, len: number, ch: string)           │
├────────────────────┼──────────────────────────────────────────────────┤
│ Returns            │ string -> modified string                        │
└────────────────────┴──────────────────────────────────────────────────┘
Examples

 leftPad('foo', 5) // => "  foo"
 leftPad('foobar', 6) // => "foobar"
 leftPad(1, 2, '0') // => "01"

```

# Component Debugging

// TODO

# Component Environment

Making sure code can run everywhere is hard. To ease this process, Bit implements 'environments'.

You can define your code's build and test requirements. Bit will then make sure all requirements are met when using a components. Taking the load of building a boilerplate to run code from you, to Bit.

All environment are basically a code component that exports an API that allows Bit to either build or test a code component.

## Build Environment

Some programming languages need some sort of compiling done in order for them to run. If you use such language, Bit will make sure that the code you write will be able to build anywhere.

Define in bit.json the required build tool your code needs. Bit will use it to get all requirements so it can build it on any environment.

The build environment is a component with a set of requirements and an API for Bit to use.

When you run `bit build`, Bit will download the build component and it's dependencies. Bit will use it to build your code within the scope. The outcome of this action will be a dist file that can run without any boilerplating.

### Using Build Environment

To show how a build environment works, lets take this code, written in [flow](https://flowtype.org).

```js
/* @flow */
module.exports = function isString(val: string): boolean {
  return typeof val === 'string';
};
```

Now we can add the flow environment to the component's bit.json file.

```json
{
    "env": {
        "compiler": "bit.envs/compilers/flow"
    }
}
```

and after running the `bit build` command, a `dist.js` file will be generated in component's folder:

```js
'use strict';

module.exports = function isString(val) {
  return typeof val === 'string';
};
```

## Testing Environment

There are many libraries designated to run test cases for code. Each developer chooses the one right for him.

Like build environments, Bit also support another type of environments for running tests.

When running `bit test`, Bit imports the configured test environments with its dependencies. Using the imported environment, Bit runs the tests. Bit gets the output from the test results, and outputs it to you.

To run tests Bit uses a Bit component which provides an API to run the test suite with the specific test tool.

### Using Test Environment

Just as build environment, a test environment is also defined in the component's bit.json file. However, to test a component you need to implement some tests for it.

Adding tests to a component is very simple. Just create a file name `spec` in the component folder, implement, add the proper test environment to the bit.json file, and run using `bit test <component ID>`

For example, lets implement tests for the `isString` code component from the privous example.

Add the following `spec.js` file:

```js
import { expect } from 'chai';

const isString = require(__impl__);

describe('#isString()', () => {
  it('should return true if `foo` is passed', () => {
    expect(isString('foo')).to.equal(true);
  });
});
```

And the following test environment to bit.json

```json
{
    "env": {
        "compiler": "bit.envs/compilers/flow",
        "tester": "bit.envs/testers/mocha"
    }
}
```

Now run the tests using `bit test <component ID>`, and see the results summary.

```sh
› bit test -i is-string
tests passed
total duration - 4ms

✔   #isString() should return true if `foo` is passed - 1ms
```

## Writing Environments

Bit does not contain build or test libraries. So you need to extend it to support your specific programming language and tooling. What you need to do is to implement a component designed to build or test using a specific library. Use a scope to host it, so you can reuse it later as a dependency for other components.