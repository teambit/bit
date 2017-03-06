
# What is a Bit component?

A component is Bit's most fundamental entity. A code component is a testable and a reusable definition of a 
certain atomic functionality that handles a single and a well-defiend responsibility.

It can be almost anything, from a function, class, object, array, string to a React or AngularJS components.

Bit's component is designed with testability 
Code components were designed to prefer composability, means we encourage adding dependencies over sourcing or any other usage pattern.

A Bit component consists of one file that includes the implementation: `impl.js`.

It can also contain two more optional files:

1. `spec.js` - contains the component's unit tests.
2. `bit.json` - contains dependencies, description, environments etc.

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

# Component Versioning

Bit's goal is to 

In Bit, versions are automatically assigned to a component once its commited (using `bit commit`) to a Scope using a simple and automatic versioning mechanism.

Once a component is commited from the `inline_components` directory to a Scope, Bit checks whether a version of this component exists and does one of the following:
1. Component with the same ID
2. 

Bit handles small code component with a single responsibility, not large packages. Such components simply tend to change less often. This made us favor strict versioning over SemVer and automatic updates. We value reliability and stability.

# Component Documentation

// TODO - add examples and why we parse js-docs.

### js-docs parsing

Parsing the Docs yield useful information, such as the description of the component, its arguments, return type and usage examples.
Other parts of the system, the Search, in particular, use that information for a better understanding what a component does.

The JS Docs get discovered by a Regex pattern, and parsing the docs is done by [Doctrine](https://github.com/eslint/doctrine).


# Component Debugging

// TODO

# Component Environment

//TODO

## Build Environment

//TODO

## Testing Environment

//TODO
