# Bit

</p>
<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7"></a>
</p>

</div>

**Bit** turns your existing source code into a collection of reusable components. You can easily develop and compose components from any application environment, without changing your source code. Bit works great for utility functions, web components (native, React, Angular etc.), small node.js modules and more.

* **Turn any subset of files into a component** without changing your source code or file-system structure. Create multiple components with a single command.
* **Develop and compose** components locally from any project, build and test them in any application environment.
* **Discover components** you and your team love and trust. Measure and monitor component quality through auto-generated docs and test results.
* **Universal control over your dependency graph.** Commit and test vast changes of dependencies and dependents at once. Bit components are also immutable.

Bit is an Apache 2.0 open-source project, actively maintained by a full-time, venture-backed team. 
It's also being used by popular open source communities.

<p align="center">
  <img src="https://storage.googleapis.com/bit-docs/readme.gif" height="500">
</p>

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
bit add src/utils/pad-left.js
# Tracked utils/left pad with files 
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
#   utils/pad-left
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
bit export bit.utils
# bit.utils is your Scope name
```

### Import

Bit `import` enables you to install a component as an application part in any destination on your project’s file system.

Let's import the component we just created to a new project.

1. Create a new project.
2. Initialize a new scope using the bit init command.
3. Import the component
  ```sh
  bit import my-scope/pad-left
  ```

The component is now in the components directory, ready to be used in your code.

**Use:**

```js
const component = require('./components/utils/pad-left');
```

## Why Bit - Built for code components

Atomic pieces of code should be composed together as lego bricks to form any functionality. Yet, as software development is being scaled, creating, finding and composing these atomic components is getting harder. Having the right tool to develop and compose components with simplicity, predictability and ease of use is the key to bringing this philosophy from theory to practice. With Bit, you can turn existing source code into a beautiful collection of reusable components for you or your team. You can develop and compose components in any application environment, making them the perfect building blocks for your different projects.

* Learn more: [Coding in the age of code components](https://blog.bitsrc.io/introducing-bit-writing-code-in-the-age-of-code-components-fd8512a9aa90)


## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedback is more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
