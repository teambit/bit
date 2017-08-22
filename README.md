# Bit
[![Bit communit hub](https://storage.googleapis.com/bit-assets/Github/readme-github-2.jpg)](http://bitsrc.io)

<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7"></a>
</p>

</div>

* **[Watch The Video](https://www.youtube.com/watch?v=vm_oOghNEYs)**

**Bit** - Organize reusable components from your existing source-code into shared-collections. Shared collections are like "playlists" that allow you to share your components with you team, and install or update individual components from any project. You and your team can find and use these components, collaborate, get updates, and stay in sync.

Bit works great for React or Angular components, Node modules, utility functions and more.

* **Turn any existing subset of files into a reusable component** without changing your source code or file structure. Turn any bulk of source code into a shared collection of components using simple commands.

* **Great discoverability for components** you and your team love and trust. Determine and monitor component quality through auto-generated docs and test results.

* **Gain universal control over your dependency graph**. Commit and test vast dependency changes at once. Build and test any component in any application environment. 

* ***Coming soon:*** Install components with the tools you love - NPM, Yarn or Bit. Create and update components in seconds from any project using Bit, and use the tool of you choice to install them.

Bit is an open-source collaborative project, actively maintained by a full-time venture-backed team and used by organizations and open source teams.

## Supported Languages
Bit is language agnostic. Still, it requires binding and additional language sensitive features for different programming languages. To do this, Bit uses language-specific drivers:

* [bit-javascript](https://github.com/teambit/bit-javascript)

## Quick start

### Install Bit

See [different install methods](https://docs.bitsrc.io/en/article/02-install-bit-on-your-computer) for different operation systems.

### Initialize Bit for your project

Initializing Bit on an existing project adds Bit’s virtualization.

```sh
bit init
```

### Add components

Bit `add` allows you to track a subset of files or directories as a reusable code component. Classic use cases would be web components (native, react, angular, etc.), utility functions or any other node.js module.

```sh
bit add src/utils/left-pad.js
# Tracked utils/pad-left with files 
```

You can use glob patterns to track a vast amount of components at once:

```sh
bit add src/utils/*.js
# Tracked 24 new components
```

### Commit

Bit `commit` commits changes to new and existing components in your application.

To check which components were changed or added and are about to be committed, you can use `bit status`:

```sh
bit status
# New components:
#   utils/left-pad
# Modified components:
#   utils/is-string
```

To commit all changes use:

```sh
bit commit -am ‘committed my first tracked code components'
```

Now all your components are staged, and ready to be pushed or used from any other project.

### Export

You can push staged/committed components to any remote Scope hosted on [bitsrc.io](https://bitsrc.io) or created on any machine (and connected via SSH).

You can set up a free Bit Scope at Bit’s [community hub](https://bitsrc.io), and follow the [setup instructions](https://docs.bitsrc.io/en/article/07-create-a-free-bitsrc-scope).

It’s also possible to easily set up a [remote scope on your own
computer](https://teambit.github.io/bit/getting-started.html#setup-a-remote-scope).

Once you have a remote scope ready, run the export command:

```sh
bit export username.scope_name
# username.scope_name is your Scope name
```

### Import

Bit `import` enables you to install a component as an application part in any destination on your project’s file system.

Let's import the component we just created to a new project.

1. Create a new project.
2. Initialize a new scope using the bit init command.
3. Import the component

  ```sh
  bit import username.scope_name/utils/left-pad
  ```

The component is now in the components directory, ready to be used in your code.

**Use:**

```js
const component = require('./components/utils/left-pad');
# 'components' is the default location for imported components
```

## Why Bit

Building software out of smaller components [makes for better software](https://addyosmani.com/first/). 
Today, this becomes truer than ever before- entire applications are built using React or Angular components, and independent functionalities are scattered across repositories and microservices.
 
Still, as developers, we often struggle to organize, find and share our existing components of code to build new things.
However, organizing and making our existing source-code components reusable - within a single project or across projects and teams - can become a real problem. To solve this, Bit allows us to turn any part of our source-code into a beautiful collection of reusable components with 2-3 simple commands. 

This means we can create and organize a playlist-like collection of our favorite components, and use the ones we need wherever we need them. Bit has many more features, from collaboration to component CI, but the best way to learn more is simply to get started.

* Learn more: [Coding in the age of code components](https://blog.bitsrc.io/introducing-bit-writing-code-in-the-age-of-code-components-fd8512a9aa90)


## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks are more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
