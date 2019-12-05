 <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
 <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
 [![Gitter chat](https://badgen.now.sh/badge/chat/on%20gitter/cyan)](https://gitter.im/bit-src/Bit)
 [![Discourse status](https://img.shields.io/discourse/https/meta.discourse.org/status.svg)](https://discourse.bit.dev/)
 <a href="https://ci.appveyor.com/project/TeamBit/bit-wikt3/branch/master"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
 <a href="https://circleci.com/gh/teambit/bit/tree/master"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bitdev_&url=https://bit.dev&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

# Bit is the shortest way to reuse atomic components between projects

![Bit Workflow](https://storage.googleapis.com/static.bit.dev/docs/images/quick_start.png)

[Documentation](https://docs.bit.dev) • [Tutorials](https://docs.bit.dev/docs/tutorials/bit-react-tutorial) • [Quick start guide ](https://docs.bit.dev/quick-start) • [Workflows](https://docs.bit.dev/docs/workflows/workflows) • [bit.dev components cloud](https://bit.dev) • [Video demo](https://www.youtube.com/watch?v=E5lgoz6-nfs) • [Gitter](https://gitter.im/bit-src/Bit) • [Twitter](https://twitter.com/bitdev_)

## What is Bit? 🤔

Bit is an [open-source](https://github.com/teambit/bit) cli tool for sharing components across projects and repositories. Bit removes the burden by automating the creation of a separate package for each component. Use Bit to turn a component inside an application into a standalone reusable package. 
You can set up your server for sharing components, or you can use the [bit.dev](https://bit.dev) cloud hosting solution for private and public components sharing with advanced features such as components CI and showcase.

## Why Bit? 🎖️

Bit simplifies the process of collaborating on UI components. Team members can share, maintain, and synchronize components from different projects.
This allows teams to:

- Increase code reusability
- Increase design and development efficiency
- Retain UI and UX consistency
- A stepping stone for establishing a [micro frontends architecture](https://martinfowler.com/articles/micro-frontends.html)

## Key Features 🔑

- Extract a component for sharing directly from an existing project.
- Build and test each component separately from the rest of the application.
- Change the source code of shared components from any consuming project. 
- Get changes in components on top of local adjustments.
- Contribute back changes made to components directly from your project.
- Let Bit auto-generate package.json for each component
- Version each component individually.
- Automated component versioning according to changes in the dependency graph chain.
- Works alongside with Git, NPM, and Yarn.

Bit is working with Javascript and Javascript frameworks: 

<img src="https://storage.googleapis.com/static.bit.dev/docs/images/js_logos.png">

## bit.dev cloud 🌩️

Use [bit.dev](https://bit.dev) cloud hosting solution as a shared server and playground for your compoentns.
<p align="center">
 <a href="https://bit.dev"><img src="https://storage.googleapis.com/bit-docs/component-discovery-bit-react-gif.gif"></a>
</p>

## Installation 🚪

```bash
npm install bit-bin --global
    or
yarn global add bit-bin  
```

Bit installation requires node 8.12 and above. Check other [installation](https://docs.bit.dev/docs/installation) methods.

## Contributing 🎗️

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License 💮

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
