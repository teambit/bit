<p align="center">
    <a href="https://bitsrc.io/">
        <img alt="Bit" src="https://s29.postimg.org/q9flqqoif/cover_github_1.png" width="500">
    </a>
</p>

<p align="center">
<b>Distributed code component manager</b>
</p>
<p align="center">
  <a href="https://ci.appveyor.com/project/TeamBit/bit"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/pr2caxu6awb387lr?svg=true"></a>
</p>
---

Bit is a simple code component manager.

It is a distributed tool for easy export and reuse of code components across repsoitories.

Bit helps to get rid of code duplications and technological debt while saving you the overhead of publishing packages.

**Easy extraction and reuse**- Easily extract and reuse of code components across repositories and projects without creating code duplications or having to publish tiny packages. 

**Simple management & maintenance**-  Maintain all your components in one place using simple commands, with simplified versioning and more reliable dependency management.

**Full component CI**-  Bit handles your component's entire lifecycle with full build and test execution, to make sure all your components are working and ready to go.

**Easily find your components**- A built-in semantic search engine and a scoping mechanism make it easy to find and use components created by you, your team or the community. 

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

* **On-export dependency resolution.** A faster, more reliable dependency resolution as dependencies are kept within the component itself.

* **Built-in semantic search engine.** Easily find code components in local and remote locations.

* **Quick consumption and modification of components.** Using simple commands such as import, modify etc.

* **Bit is distributed**.

## Install

#### macOS

Homebrew - Bit can be installed via Homebrew package manager:

`brew install bit`

#### Debian/Ubuntu Linux

On Debian or Ubuntu Linux, you can install Bit via our Debian package repository. Configure it using this command

```
curl https://bitsrc.jfrog.io/bitsrc/api/gpg/key/public | sudo apt-key add -
sudo sh -c "echo 'deb http://bitsrc.jfrog.io/bitsrc/bit-deb all main' >> /etc/apt/sources.list"
```

Then simply install using

`sudo apt-get update && sudo apt-get install bit`

#### CentOS / Fedora / RHEL

On CentOS, Fedora and RHEL, you can install Bit via our RPM package repository.

`sudo wget http://assets.bitsrc.io/bitsrc.repo -O /etc/yum.repos.d/bitsrc.repo`

Then simply install using

`sudo yum install bit`

#### Windows
There are two installation methods for Windows.

1. **Download installer** - You can download a msi file and run it.

    Installation can be found [here](https://api.bitsrc.io/release/msi/latest).

2. **Chocolatey** - Bit can be installed via Chocolatey:

    `choco install bit`

#### Other

##### NPM 

If you have NPM installed, you can use it to install Bit:

`npm install --global bit-cli`

##### Yarn

If you have Yarn installed, you can use it to install Bit:

`Yarn global add bit-cli`


## Getting Started

Here is a [Quick getting started manual](https://github.com/teambit/bit/wiki/Getting-Started).

You can also head over to Bit's [wiki pages](https://github.com/teambit/bit/wiki) for more information.

## Contributing to Bit

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).
