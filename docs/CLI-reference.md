
# CLI Reference

## Build

### Name

build-cmd - Uses the compiler defined in bit.json to return the compiled version of the component.

### Synopsis

```
Bit build [component ID] [-inline | -i]
```

### Description

This command get all the boilerplate dependencies for building a component according to its bit.json configuration. When boilerplate is set, uses it to compile the code to distributable.
For example - if a component is written in Babel, it will download Babel, and use it to compile the code to ES. 

### Options

`-i, --inline # Create a compiled file on an inline component (dist/dist.js).`

### Examples

Build a specific component.

`bit build [component ID]`

Build a component in the [inline_components](artifacts.md) folder.

`bit build [component ID] -i`

---

## Commit

### Name

commit-cmd - Commit a bit to the local scope and adds a log message.

### Synopsis

`bit commit [component ID] "[message]"`

### Description

Moves a component from your development environment to the project's local scope (staging area), to prepare for export.

---

## Config

### Name

config-cmd - Global configuration management.

### Synopsis

`bit config ...`

### Examples

---

## Create

### Name

Bit-create - Creates a new component in the current scope.

### Synopsis

`bit create [component ID] [--specs | -s] [--json | -j]`

### Description

This commands creates a new component in the current scope's development environment. To find the right scope, it will go up the directory tree to find the nearest scope, and use it.

### Options

```
-s, --specs
    # Create a file to contain the specifications for the component.

-j, --json
    # Create a file to configure additional metadata on the component. See bit.json for additional information.
```

### Examples

Create a component
    
`bit create [component ID]`

Create a component with a specs file
    
`bit create [component ID] -s`

Create a component with a bit.json file
    
`bit create [component ID] -j`

Create a component with specs and bit.json files
    
`bit create [component ID] -s -j`

---

## Export

### Name

export-cmd - Export a component to a remote scope.

### Synopsis

`bit export [component ID] [remote scope] [--indentity-file | -i]="path to identity file"`

### Description

Pushes a component from the local '.bit' folder to a remote scope, to update a version, or submit a new functionality to a scope. Making it available for others to use.

### Options

```
-i, --indentity-file
    something?....
```

### Examples

Export a component
    
`bit export [component ID] [remote scope]`

---

## Import

### Name

import-cmd - Imports a component to scope.

### Synopsis

`bit import [component ID] [--save | -s] [--tester | -t] [--compiler | -c]`

### Description

Imports a component from a remote scope to the local scope you currently work on, so that you can use the component in your code. This commands adds the component as a dependency to your code via an entry in bit.json file.

A component can be defined as a 'tester' or a 'compiler', to be used as an [environment](artifacts.md).

You can also choose to simply download component to the current folder, and not to the scope, to be viewed/tested without adding to your bit.json file.

There's no need to set compiler or tester components as dependencies for your scope. Bit imports components that are runnable, so no need to test or build them in order to use them.
### Options

```
-s, --save
    Imports component to current folder, no need for scope.

-t, --tester
    Imports the component as a 'testing environment', so Bit will be able to use it to run the tests for components.

-c, --compiler
    Imports component as a 'building environment', so Bit will be able to use it to compile the component to a runable code.
```

### Examples

Import a component, and set it as a dependency for the current scope.

`bit import <component ID>`

Import a component, without saving it as a dependency.

`bit import <component ID> -s`

Import a component as a build environment, and not set it as a dependency for the project.

`bit import <component ID> -c`

---

## Init

### Name

bit-init - Initiate an empty scope.

### Synopsis

`bit init [path] [--bare[=<name>] | -b] [--shared[=<groupname>] | -s]`

### Description

This command creates an empty Bit scope - basically a bit.json file, and a .bit directory with subdirectories for objects, environment and temporary files.

Running ‘bit init’ in an existing scope is safe. It will not overwrite components that are already there but only reinitialize corrupted system files if possible.

### Options

```
-b, --bare # initialize an empty bit bare scope

--shared # add group write permissions to a repository properly
```

### Examples

Creates an empty Bit scope in current working directory.
    
`bit init`

Creates an empty Bit scope in /tmp folder.
    
`bit init /tmp`

Creates a bare scope named ‘my-scope’.
    
`bit init --bare my-scope`

Specify that the Bit scope is to be shared by several users in the same group by setting file group permissions properly. This allows users belonging to the same group to export components into that scope.

`bit init --bare --shared`

---

## List

### Name

list-cmd - List all components in a scope.

### Synopsis

`bit list "[scope name]" | [--inline | -i]`

### Description

Lists all components in a remote scope, local scope or the inline_components folder. This allows for easy browsing of data, to understand the contents of a scope.

### Examples

List all components in local scope.

`bit list @this`

List all components in inline_components folder

`bit list -i`

List all components in a remote scope.

`bit list bit.env`

---

## log

### Name

log-cmd - Show a log of a specific component.

### Synopsis

`bit log <component ID>`

### Description

Show a log of a specific component, including all commit messages. Can run on local or remote components.

### Examples

Show log of a local component

`bit log @this/<component ID>`

Show log of a remote component

`bit log <remote component>`

---

## Modify

### Name
Bit-modify - Sets a component from local scope for modification.

### Synopsis
    
`bit modify [component ID]`

### Description

This command allows modifications to an already published component. Once you have the component in your local scope (@this), you can use this command to prepare it for modification.

When the component is being 'modified', it's in the inline_components folder, which means you can now do any modification to it. To save modifications, issue the 'commit' command.

### Examples

Modify a component that is in your local scope.

`bit modify @this/<component ID>`

Mofidy a remote component.

`bit modify <component ID>`

---

## Remote

### Name

remote-cmd - Manages your list of remote scopes.

### Synopsis

`bit remote [add="remote scope"] [rm="remote name"] [--global | -g]

### Description

Bit allows you to connect to remote scopes to allow importing and exporting components. This allows collaboration on code components, share them across teams, and reuse across projects.

The 'remote' command manages the list of remote scopes connected to current remote.

When working with many remotes, and some dependencies are shared between remote scopes, you must connect these scoepes between themselves. This will allow components to have dependencies from other scopes.

### Options

```
-g, --global
    Manage globally configured remotes
```

### Examples

Add a remote scope to local scope.

`bit remote add <scope url>`

List all remote scopes configured to locaol scope.

`bit remote`

Remove a remote scope

`bit remote rm <scope name>`

---

## Search

### Name

search-cmd - Search a component in a scope.

### Synopsis

`bit search search_query -s @scope_name`

### Description

Search in either local or remote scope for a component. The search covers the name, description and docs of each component.

Each scope has its own index of components. 

If you search in the current scope, use `bit search search_query -s @this`.

To search in another scope, use `bit search search_query -s @scope_name`

To search public components on [bitsrc.io] (www.bitsrc.io), use `bit search search_query`

### Examples

Search for a component in a current scope.

`bit search concat array -s @this`

Search for a component in a remote scope.

`bit search concat array -s @my_remote_scope`

Search for a public component on [bitsrc.io] (www.bitsrc.io).

`bit search concat array`

---

## Show

### Name

show-cmd - Show metadata of a given component.

### Synopsis

`bit show [--inline | -i] [component ID]`

### Description

Shows name, description, environment, docs, version, date.... of a component.

### Options

```
-i, --inline
    Shows data of component in inline_components folder
```

### Examples

Print data of local component.

`bit show @this/<component ID>`

Print data of a remote component.

`bit show <component ID>`

print data of a component in inline_components.

`bit show -i <component ID>`

---

## Status

### Name
Bit-status - Show status of components in modification.

### Synopsis

`bit status`

### Description
Displays list of all components in current workspace. Shows the state for each component.

Do this to figure out which component needed to be exported to a remote scope, in case of modifications made to it.

Similar to `git status`.

---

## Test

### Name

test-cmd - Runs a component test suite.

### Synopsis

`bit test [--inline | -i] [component ID]`

### Description

Runs a component test suite using the testing environment defined for the component. This is to validate a component can still work in an isolated environment.

### Options

``` 
-i, --inline
    Run tests on a component in inline_components
``` 

### Examples

Run a test suite.

`bit test @this/<component ID>`.
