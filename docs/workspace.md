# Workspace

When running the `bit init` command, you essentially create a local workspace to work with code components. The workspace contains 3 directories, each with its own responsibility and attributes. In this section we will list all of them, define their purpose and talk about the use cases in which you will work with each of them, and comment on how to use them when working with source code management tools for your project, and other packaging managers.

### .bit Directory

`.bit` is the 'local scope' that is being referred across these docs.

Think about it as a file-system based DB for Bit. It holds all the object Bit manages, as well as contains the indexes for the `search` command.

Note - You should not have this folder managed in your SCM, nor sourced to a package you develop. This is a hidden directory, for the use of Bit only.

For more information on this folder, head over to the [Bit internals](bit-internals.md) section.

### Components

This folder contains all the components (and their dependencies) that you have defined as dependencies for your project in the project's `bit.json` file.

It's important to understand that all the contents of this folder is managed by Bit, and should not be changed by you. If you require to modify an implementation, you can do so by issue the `bit modify` command, which will set the component to be in edit mode, and accessible in the `inline_components` directory.

If you plan to package your project in another package manager, make sure to source (package) the `components` folder alongside your project, so all of the code components required by your code, will be downloaded with your package.

#### Directory Structure

<namespace>/<component name>/<scope name>/<component version>

This structure enables your project to use components with the same names (or namespaces), in multiple versions, in the same project.

The implementation, specification, configuration and distribution files are all located in the leafs of the tree.

#### Example

```sh
components
├── compilers
│   └── flow
│       └── bit.envs
│           └── 2
│               ├── bit.json
│               └── impl.js
├── string
│   └── left-pad
│       └── itaymendel.scope1
│           └── 1
│               ├── bit.json
│               ├── dist
│               │   └── dist.js
│               ├── impl.js
│               └── spec.js
└── testers
    └── mocha
        └── bit.envs
            └── 4
                ├── bit.json
                └── impl.js
```

As you can see, I have 3 components:

1. bit.envs/compilers/flow::2
2. itaymendel.scope1/string/left-pad::1
3. bit.envs/testers/mocha::4

Now, if I run import another component, you can see how this structure will not have any name collisions.

### Inline Components

Just like editing your code 'inline', you would edit code component in the `inline_components` directory.

In a sense, all components that are in this directory are components are a part project, and you actively work on them. This means that you can change them as much as you want, and they will be still usable in your code by requiring them via [bit-js](). And at the end of your work, you will need to commit the changes, to save all changes made to a component, to your local scope.

Note - You should not have this folder managed in your SCM, nor sourced to a package you develop. This folder is meant to manage work-in-progress only.

#### Directory Structure

<namespace>/<component name>

There are no versions or scopes for components in this directory. This is because only scopes decide on the version number for a component, and the inline_components directory is outside of any scope.

#### Creating new components

The inline_components directory plays a vital role when creating code components. When you issue the `bit create` command, the component is created there, ready to be implemented tested.

Moving components from the inline directory to the local scope (.bit directory), you need to use the `bit commit <component ID>` command.

#### Bit Commands for Inline Components

When working with inline code components, you must use the `-i` flag, to tell Bit that the component is currently in the inline_components directory (for example `bit test -i <component ID>`).

#### Example

To see a list of all components that are in this directory, you can use the `bit status` command.

```sh
› bit status
inline components
     > global/is-string
```

And this is the corresponding directory structure for it:

```sh
› tree inline_components
inline_components
└── global
    └── is-string
        ├── bit.json
        ├── impl.js
        └── spec.js
```