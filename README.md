<p align="center">
    <a href="https://bitsrc.io/">
        <img alt="Bit" src="https://s29.postimg.org/q9flqqoif/cover_github_1.png" width="500">
    </a>
</p>

<p align="center">
<b>Distributed code component management</b>
</p>
<p align="center">
  <a href="https://ci.appveyor.com/project/TeamBit/bit"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/pr2caxu6awb387lr?svg=true"></a>
</p>

Bit is a single open source project to easily maintain and reuse all your code components. 

Bit allows you to:

- **Easily export** components from your code to be used in other repositories or by other team members.
- **Maintain your components end-to-end** including simple versioning, faster dependency management and CI.
- **Find and use** tested and ready-to-go components created by you or your team.

## Install
```bash
npm install bit-bin -g
```
For other installation methods, please check out our wiki's [installation section](https://github.com/teambit/bit/wiki/install).

## Get started
Create the component isString 
```bash
bit create string/is -s
```

Edit your component's code and tests using your favorite IDE
```bash
vim inline_components/string/is/impl.js
vim inline_components/string/is/spec.js
```

Commit your component to your Bit scope
```bash
bit commit string/is 'initial commit'
```

Export your newly created component to a remote scope
```
bit export @this/string/is @my-scope
```

After exporting a component you can easily import it anywhere using:
```bash
bit import @my-scope/string/is
```

In case you would like to modify this component, you can just use:
```bash
bit modify @my-scope/string/is
```

## Why?

The current ecosystem is not suited for management of code components. 

As a result code components are being duplicated across repositories creating an ever growing technological debt. People also spend much time and effort re inventing the same components over and over again. 

This happens because packages are simply too much overhead. Publishing and maintaining a package + repository + CI for every small component is an unscalable odyssey. Packages are also hard to find, and add unnecessary weight and complexity. 

This is why we built Bit - the simple code component manager.

* Bit helps get rid of code duplications by making it it easy to extract reusable components from your code to be used anywhere you like.

* It allows you to easily maintain all your components in one place with full versioning and dependency management.

* It takes care of your components CI cycle with build and test execution.

* It makes your components easy to find with a built in semantic search engine.

Ultimately, bit allows you to create a dynamic collection of fully managed and good-to-go reusable components ready to be used anywhere. 

## Features

* **Export components with one command** A single CLI command to export a reusable component to be use anywhere and by anyone you like.

* **Component CI.** Bit‘s scoping mechanism takes care of your component’s build and test execution.

* **Full versioning management.** Bit takes care of version management with a simplified incremental versioning for easier update and maintenance.

* **On-export dependency resolution.** A faster, more reliable dependency resolution as dependencies are kept aside the component itself.

* **Built-in semantic search engine.** Easily find code components in local and remote locations.

* **Quick consumption and modification of components.** Using simple commands such as import, modify etc.

* **Scope distribution** enables you to create a Bit scope, anywhere with a single `bit init` command.

## Learn more

Here is a [Quick getting started manual](https://github.com/teambit/bit/wiki/Getting-Started).

You can also head over to Bit's [wiki pages](https://github.com/teambit/bit/wiki) for more information.

## Contributing to Bit

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).
