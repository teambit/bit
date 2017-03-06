
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
The implementation file consists the component implmantation itself and its docs which are parsed to form 
the entire component documantation (see [Component Documentation](#component-documantation) section for more info).

On top of the implmantation file, two more optional files can be added:

1. `spec.js` - 
  contains the component's unit tests, designated to be executed by the configured [Testing Environment](#testing-environment).
2. `bit.json` - 
  Configuration file for handling of dependencies, environment, naming conventions and more.

Please note, component file names can be configured via [bit.json](configuring-bit.md#bitjson), `spec.js` and `impl.js` are the default names.

### Component Example

`impl.js`
```js
/**
 *
**/
module.exports = function isString(val) {
  return typeof val === 'undefined';
}
```

`spec.js`
```js

```

`bit.json`
```json
{

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

# Component Versioning

Bit's goal is to 

In Bit, versions are automatically assigned to a component once its commited (using `bit commit`) to a Scope using a simple and automatic versioning mechanism.

Once a component is commited from the `inline_components` directory to a Scope, Bit checks whether a version of this component exists and does one of the following:
1. Component with the same ID
2. 

Bit handles small code component with a single responsibility, not large packages. Such components simply tend to change less often. This made us favor strict versioning over SemVer and automatic updates. We value reliability and stability.

# Component Documentation

Documentation for packages is not fun, but if you want your code to be truely reuseable, other developers will need to have a place to learn how to use your code. We beleive that the best place to tell people how to use your code, is... well.. alongside your code. This way, when you distribute code components, and even open a code component to review it's code, the usage instruction are there (!).

This is no magic. To do this, bit utilize the 'Xdoc' format for annotating everything as a part of yoru code.

Let's take JavaScript for example.

JavaScript uses [JSDocs](http://usejsdoc.org) to create documentation on JS code. Bit knows how to read these docs, and parse them in a way that gives other users a formatted view of them, to better understand what to expect from the component before even using it.

To view the docs for a component you can either open the code, or use the `show` command (which also works on [remote scopes](bit-scope.md)).

```sh
› bit show string/pad-left
┌────────────────────┬──────────────────────────────────────────────────┐
│ ID                 │ string/pad-left                                  │
├────────────────────┼──────────────────────────────────────────────────┤
│ Compiler           │ bit.envs/compilers/flow::2                       │
├────────────────────┼──────────────────────────────────────────────────┤
│ Tester             │ bit.envs/testers/mocha::4                        │
└────────────────────┴──────────────────────────────────────────────────┘
Documentation
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

### Discoverability using documentation

Bit has an internal search engine. This search engine uses the data parsed from the code component documentation to build indexes and search in them. So by better documenting your components, other users will discover them easily.

# Component Debugging

// TODO

# Component Environment

//TODO

## Build Environment

//TODO

## Testing Environment

//TODO
