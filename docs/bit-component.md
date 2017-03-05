
#Component ID

Bit components are universily and uniquely identified using a Bit ID to support the distributed nature of a Scope.

Each Bit component has its own ID which is a composition of the scope name, namespace and name of the component. 
For example, a component named `string/is` stored in a Scope named `foo` would have the following ID:

```
@foo/string/is
```

In case the component's source is stored on your local scope, you can also use the `@this` keyword syntactic-suger to reference it.

```
@this/string/is
```

To reference a component which was not commited to any scope yet and exists within the `inline_components` directory, 
just ignore the scope name. 

```
string/is
```
In this case, Bit will look for a directory named `string` with a component directory named `is` in your `inline_components` directory.

#Component Versioning

Bit only supports incremental versioning. One might wonder if this is a lesser way of doing things. If using SemVer is better, because you get small fixes automatically. But, as we see in new packaging tools (OSTree, Snappy), the later approach is being increasingly unused. SemVer is based on a developer decision, and as such, is not bullet-proof. 

Bit handles small code component with a single responsibility, not large packages. Such components simply tend to change less often. This made us favor strict versioning over SemVer and automatic updates. We value reliability and stability.

#Component Documantation



#Component Environment

//TODO

#Build Environment

//TODO

#Testing Environment

//TODO
