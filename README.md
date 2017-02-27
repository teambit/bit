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

## Installation
For the different installation methods, please check out our wiki's [installation section](https://github.com/teambit/bit/wiki/install).

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

## Features

* **Export components with one command.** A single CLI command to export a reusable component with only two files: impl and specs.

* **Component CI.** Bit‘s scoping mechanism takes care of your component’s build and test execution.

* **Simple versioning management.** Bit takes care of version management with a simplified incremental versioning for easier update and maintenance.

* **On-export dependency resolution.** A faster, more reliable dependency resolution as dependencies are kept within the component itself.

* **Super fast component installation** Components are lighter and faster to install depending on bandwidth alone. 

* **Built-in semantic search engine.** Easily find and use components created by your or your friends.

* **Quick modification and update of components.** Using simple commands such as import, modify etc. to modify and update your components.

* **Scope distribution** enables you to create a Bit scope, anywhere with a single `bit init` command.

## Why Bit?

Today, we often find ourselves re-implementing or copy-pasting pieces of code in multiple places. This wastes time and effort while turning our code base into a maintenance nightmare.

The alternative, spending hours on boilerplating and publishing a package + git repository + CI for every small component is simply too much overhead. Packages are also hard to find and add unnecessary weight and complexity. 

This compelled us to build a single tool that allows us to easily extract code components from our code and use them anywhere we want. We also made sure our components would be taken care of through their entire lifecycle, so that they can be trusted and deployed anywhere.

Finally, we made sure our team can collaborate by importing and exporting each other’s components to build and maintain our projects. 

Ultimately, bit allows you to create a dynamic collection of fully managed and good-to-go components ready to be used anywhere. This is something we truly believe in.

## Learn more

Here is a [Quick getting started manual](https://github.com/teambit/bit/wiki/Getting-Started).

You can also head over to Bit's [wiki pages](https://github.com/teambit/bit/wiki) for more information.

## Contributing to Bit

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).
