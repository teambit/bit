# Bit
[![Bit communit hub](https://storage.googleapis.com/bit-assets/Github/readme-github-3.jpg)](http://bitsrc.io)

<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7"></a>

</p>

</div>

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

[Website & Community](https://bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Demo Components](https://bitsrc.io/bit/movie-app#styles) • [Docs](https://docs.bitsrc.io/en) • [Gitter](https://gitter.im/bit-src/Bit) • [Blog](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca) 

Bit is a fast and powerful way to share and sync source code components between different SCM repositories and projects. As a nearly-seamless extension for your Git workflow, it enables you to track and share components directly from your project's repository and install them in other projects while keeping them synced.

Bit cuts the overhead of sharing components and syncing them between repositories. Instead of setting up additional repositories and packages, you can track and share any number of components directly from your repository's source code. Components are shared into organized playlist-like collections, which makes them individually available to discover, install and update from any repository or project.

* **Share any subset of files as a reusable component** directly from your project's repository, without changing your source code or file structure. Share multiple components in seconds and sync them across projects.

* **Organize and discover components** shared and loved by your team. Determine and monitor component quality through auto-generated docs, test results and visual rendering.

* **Universal control over your dependency graph**. Commit and test vast dependency changes at once. Build and test any component in any application environment. 

* ***Coming soon: NPM / Yarn component installation***.

* ***Coming soon: Event driven component updates***.


Classis use case for Bit are [sharing UI components](https://github.com/teambit/docs/blob/master/node-tutorial.md) (React, Angular etc), [sharing node.js components](https://github.com/teambit/docs/blob/master/node-tutorial.md) between microservices, turning static shared libraries into "playlists" of individual components and more.

Bit is an open-source collaborative project, actively maintained by a full-time venture-backed team and used by organizations and open source teams.

## Demos & Tutorials

1. [Bit with React components](https://teambit.github.io/docs/react-tutorial.html).
2. [Bit with node.js components](https://github.com/teambit/docs/blob/master/node-tutorial.md).
3. A demo collection of [React movie-app components](https://bitsrc.io/bit/movie-app).
4. A matching [React component library](https://github.com/itaymendel/movie-app) with Bit.
5. A [short demo video](https://www.youtube.com/watch?v=vm_oOghNEYs).

## Supported Languages
Bit is language agnostic. Still, it requires binding and additional language sensitive features for different programming languages. To do this, Bit uses language-specific drivers:

* [bit-javascript](https://github.com/teambit/bit-javascript)

## Quick Start

* You can find the full getting started guide [here](https://teambit.github.io/bit/getting-started.html).
* You can find a list of command examples [here](https://docs.bitsrc.io/en/article/usage).

### Install Bit

See [different install methods](https://teambit.github.io/bit/installation.html) for different operation systems.

### Initialize Bit

To start tracking even the most simple of components, we will need to create a workspace (local Scope) for your project. Use the local scope to organize and track the code components within your project.

To create a local Bit Scope for your project, run this command:

```sh
bit init
```

### Create a Simple Component

A Bit component can be a React or Angular component or any other Javascript component. 
The simplest Bit component is a single file, with zero dependencies.
Let's create a simple JavaScript module.  Create a file called `index.js` and paste the following code in the file:

```js
/**
 * Vaildates if input is string- throws exception if not
 * @param {string} name
 * @returns bool
 * @example
 * ```js
 * isString(str)
 * ```
 */
module.exports = function isString(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Not a valid string');
  }
};
```

Let's track our component, and name it 'utils/is-string'.

```sh
bit add index.js -i utils/is-string
```

You can also use glob patterns to track a group of components together.

Now run a quick `bit status` command to validate that `utils/is-string` is being tracked.

### Tag a Component

Now, let's Tag the newly tracked component. 
Tagging a component will lock of all its dependencies (in this case we have none), and create a version for the component.

```sh
bit tag -am 'initial version'
```

Another quick `bit status` command will show that the component is now staged, and ready to be exported.

### Create a Scope

Components are shared into playlist-like collections called Scopes. A scope is a collection of shared components with a common theme or ownership. Scopes allow you to organize and maintain components in a single location, while individually installing and updating them. They also act as a registry for the components it hosts. 

Scopes are super lightweight and can be [set up on any server](https://teambit.github.io/docs/advanced.html#host-your-own-scope), in any location. 

You can also freely host your Scopes on the Bit community hub, [BitSrc](https://bitsrc.io).

For this quick-start guide, let's [connect to to BitSrc](https://teambit.github.io/docs/bitsrc-setup.html##signup-to-bitsrc) and [create a Scope](https://teambit.github.io/docs/getting-started.html#create-a-scope).

### Export Components

After creating a Scope, run the `export` command. 
This will publish your components and make them available to share in other projects:

```
bit export <username>.<scopename>
```

And you're done!  
Browse your Scope and your different components which are now available for import.

You can check out an example or React movie-app components exported to BitSrc [here](bitsrc.io/bit/movie-app).

### Import Components

Bit enables you to import individual components to use in your different projects.  
You can install a component as an application part in any destination on your project’s file system.

Let's import the components we just created to a new project.

1. Create a new directory for the consuming project.
2. Initialize a new scope using the `bit init` command.
3. Import the component:

```sh
bit import <username>.<scopename>/utils/is-string
```

You can now use the component in your new project:

```
const component = require('./components/utils/is-string');
# 'components' is the default location for imported components
```

### Updating Components

Components can be updated from any project which is using them.

To update a component, simply change the code from inside your project's context. 
Afterwards tag it again, and export it back to your Scope as a new version of your component.

1. Open the file you just imported.
2. Make any change in it.
3. Run the `bit status` command to check that `utils/is-string` has been modified.
4. Tag a new version for the component:

```sh
bit tag -am "updated component"
```

5. Export the new version of the component back to the Scope:

```sh
bit export <username>.<scopename>
```

Now you can go back to your browser, and see that there's a new version for `utils/is-string` with the changes we've made from the consumer project.

## Why Bit

*You can learn more on Hackernoon: "[How we started sharing components as a team](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca)".*

With every new feature and every new member joining our team, we found it increasingly hard to share our code and keep it synced between projects. Determined to avoid duplications, we considered many solutions including an arsenal of small repos and packages or creating vast shared static libraries.

However, issues such as the publish overhead, discoverability, and maintainability prevented us from truly sharing and syncing our components as a team between our projects.

Finally, we decided to build our own open-source project that will allow us to share components directly from our SCM repo’s source code, organize them as a team with defined ownership and sync them between different projects. In a way, Bit is a “virtual monorepo” that syncs components on top of our entire codebase, with both multi-repo and mono-repo architectures in mind.

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks are more than welcome @ [team@bitsrc.io](mailto:team@bitsrc.io) or via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
