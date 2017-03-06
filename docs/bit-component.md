
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

Bit only supports incremental versioning. One might wonder if this is a lesser way of doing things. If using SemVer is better, because you get small fixes automatically. But, as we see in new packaging tools (OSTree, Snappy), the later approach is being increasingly unused. SemVer is based on a developer decision, and as such, is not bullet-proof.

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

# Build Environment

//TODO

# Testing Environment

//TODO
