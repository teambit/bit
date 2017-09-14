# Bit
[![Bit communit hub](https://storage.googleapis.com/bit-assets/Github/readme-github-2.jpg)](http://bitsrc.io)

<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7"></a>

</p>

</div>

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

[Website & community](https://bitsrc.io) • [Short video](https://www.youtube.com/watch?v=vm_oOghNEYs)  • [Demo project](https://github.com/itaymendel/movie-app)  • [Demo collection](https://bitsrc.io/bit/movie-app#styles)

Bit enables you to share components from your existing source-code into shared playlist-like collections, share them with your team, and install or update them from any project with simple & curated maintenance. 

You and your team can easily share and discover components, collaborate, get updates and stay in sync.

Bit works great for React or Angular components, Node modules, utility functions and more.

* **Turn any existing subset of files into a reusable component** without changing your source code or file structure. Turn any bulk of source code into a shared collection of components using simple commands.

* **Great discoverability for components** you and your team love and trust. Determine and monitor component quality through auto-generated docs and test results.

* **Gain universal control over your dependency graph**. Commit and test vast dependency changes at once. Build and test any component in any application environment. 

* ***Coming soon:*** Install components with the tools you love - NPM, Yarn or Bit. Create and update components in seconds from any project using Bit, and use the tool of you choice to install them.

Bit is an open-source collaborative project, actively maintained by a full-time venture-backed team and used by organizations and open source teams.

## Demos

1. An example of a React [movie-app component library](https://github.com/itaymendel/movie-app) shared with Bit [as a collection of individually accessible and discoverable components](https://bitsrc.io/bit/movie-app#styles) - without forcing source-code and filesystem changes to the repository itself.

2. A [short demo video](https://www.youtube.com/watch?v=vm_oOghNEYs) of sharing these components across applications.

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
# tracking component utils/left-pad:
#  added src/utils/left-pad.js
```

You can use glob patterns to track a vast amount of components at once:

```sh
bit add src/utils/*.js
# tracking 24 new components
```

### Commit

Bit `commit` commits changes to new and existing components in your application.

To check which components were changed or added and are about to be committed, you can use `bit status`:

```sh
bit status
# new components:
#   utils/left-pad
# modified components:
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
computer](https://docs.bitsrc.io/en/article/set-up-remote-bit-scope).

Once you have a remote scope ready, run the export command:

```sh
bit export username.scope_name
# exported 2 components to scope `username.scope_name`
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

In today's software architecture, and with new frameworks such as React, Angular and more, it becomes increasingly important to share, discover and reuse different parts of our source code with our team and across repos.

Using shared libraries resembles in many ways to using a static CD-Rom: it contains a lot of stuff we don't need in every use, they add weight and complexity, maintaining or updating them is hard - and they make discoverability very difficult.

To solve this, we created Bit.
It allows us to share any number of parts from our source-code into a playlist-like collection of reusable components, and share them with our team across projects. Individual components can be discovered, used or updated from any project.

With Bit, we can easily organize, share and discover our components, reduce our app's size and build times, use nothing but the code we need, and get useful information for choosing the rights components.

We've been using it for over 8 months, and so do many organizations and different communities. 
Feel free to try it out, contribute or add drivers for any language you wish.


## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks are more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
