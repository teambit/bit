
The glossary defines the various Bit entities and explains the relationship between them.

## Component

A code component is the smallest atomic functionality that handles a single responsibility.
It can be a anything, for example function, class, object, array, string etc ...

Small components can be composed together, creating a greater functionality.

A Bit component consists of one file that includes the implementation: `impl.js`.

It can also contain two additional (recommended) files:

1. `spec.js` - contains the component's unit tests.

1. `bit.json` - contains dependencies, description, environments etc.

## Component id

There are two types of ids.

### Full id

Consists of `<scope>/<box>/<component>::<version>`, used in bit.json `dependencies`, `compiler` and `tester` fields.

When you want to refer to a component located in a bit scope, you have to use the full id.

### Inline id

Consists of `<box>/<component>`.
When you want to refer to a component located in the inline_components, you have to use the inline id.
You can also use the inline id to refer the components from your code. `bit('array/sort')`

## Scope

A scope is a collection of boxes and components. The most basic role of the scope is to group and organize components. The scope's name appears in the component's id.

Scopes are where components are stored, built and tested.
There are two kinds of scopes: Local and Remote.

The local and Remote scopes are technically identical.
However, they serve different purposes.

### Local scope

Each project has a unique local scope. It should be used as a "staging area" for the project's components.

- A local scope is automatically created for your project when you issue a `bit init` command. It can be found under the `.bit` directory.

### Remote scope

The best way to work with Bit and enjoy its full advantages is to work with a remote scope.
Components should be first committed to your local project's scope, then exported to a remote scope.

- A remote scope is just a regular scope created on a remote machine.

By doing so, you enable multiple team members to be connected to the same scopes making it easy to reuse components and collaborate. You can connect a remote scope to other remote scopes, creating an interconnected scopes network.

- You can create a remote scope with the `bit init --bare` command in an empty directory. Bit will take the directory name as the scope name as a default behavior.

Use a `bit remote add` command to manually set up your own remote scope on a local machine.

For more information on how to set a remote scope [learn more here](Getting-Started#setting-a-bit-scope).

## Scope network

Scopes can be interconnected between themselves to form a network.
By implementing a network, scopes can share components as dependencies.

You can read more about this topic at the [Network of Bit scopes](Advanced#bits-distributed-network) section.

## Box (namespace)

Boxes are actually just namespaces. They can help organize your components.
if you don't specify a box, the component will be created at the global box.

Example: `bit create array\sort` # create the component 'sort' in the 'array' box.
Example: `bit create do-work` # create the component 'do-work' in the 'global' box.

To use components within boxes, you can append the box name to the component's ID when calling it.

Example: bit('array\sort');
Example: bit('do-work');

## inline_components

The inline_components directory is a workspace for creating new components.

Creating or modifying a component can be done directly from your inline_components directory, without having to create a new project or switching contexts. This is a key concept in Bit's workflow.
you can create a component yourself, or use `bit create <component_name>`

Once you are done writing (or modifying) a component, you can commit the changes using the `bit commit <component_name>` command. This command packages your component and runs the Bit CI cycle to test and build the component. The final result is extracted from your inline folder to the project’s local scope.

Important notes:

- It is considered best practice try and keep the inline_components empty. You should only have components in there if you are currently working on them.

- This folder should be a part of your project, so it can't be in the .gitignore file (for example).

- The drivers that implement the resolution algorithm will check the inline_components before going to the components directory.

## components directory

The components directory is managed by Bit. All the imported components will be there.

## bit.json

The bit.json file is used as a configuration file for project and component levels.

### project bit.json

Used for defining project dependencies (bit components), that will be imported in the `bit import command`.
Also, used as a prototype for defining default properties for the components in the inline_directory.

- for example, if a component does not have a bit.json file, it inherits all properties (besides dependencies) from the project's bit.json.

### component bit.json

Used for defining the component's dependencies, package dependencies, compiler, tester, and the names of impl. and spec. files.

## Environment

Bit consists of two main environments build (compile) and test.

### Build environment

Some programming languages need some sort of compiling/transpiling in order for them to run. If you use such language, Bit will make sure that the code you write will be able to compile anywhere.

### Compiler

The required `compiler` your code needs is defined in bit.json { env: { compiler: `compiler_id` }}.
The build environment is just a Bit component with a simple interface. It must have a compile method, which is a sync method that accepts raw source code (`string`) and returns compiled code (`string`).

### Test environment

There are many designated libraries to run unit tests for code. Each developer chooses the one her/she needs.

### Tester

the `tester`, like the compiler, it's just a Bit component implementing the tester interface. It is defined in bit.json under { env: { tester: `tester_id` }}.