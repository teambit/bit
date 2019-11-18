# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
and this project adheres to [Semantic Versioning](http://semver.org/).

## [unreleased]

## [2.1.4-dev.1] - 2019-11-18

- [#2140](https://github.com/teambit/bit/issues/2140) support `import { x as y }` syntax

## [2.1.3] - 2019-10-23

### Bug fixes

- [#2079](https://github.com/teambit/bit/issues/2079) fix error when Yarn workspaces uses nohoist
- [#2072](https://github.com/teambit/bit/issues/2072) upgrade module-definition package to support React fragments

### Internal

- move from flow to typescript

## [2.1.2] - 2019-10-06

- avoid recognizing any require/import starts with `.` as a custom-resolve-module on Windows

## [2.1.1] - 2019-08-14

- remove angular dependencies. use typescript compiler to parse Angular Decorators
- [#1925](https://github.com/teambit/bit/issues/1925) fix Angular non-relative paths from decorators

## [2.1.0] - 2019-07-18

- propagate from component root dir backwards to find tsconfig.json for Angular projects
- [#1779](https://github.com/teambit/bit/issues/1779) resolve first according to the custom-resolve settings and fallback to the standard resolver
- fix dependency resolution of `.` and `..` to not be identified as custom-resolved used.
- add rxjs package
- support angular components (experimental)

## [2.0.11] - 2019-06-05

- [#1708](https://github.com/teambit/bit/issues/1708) support `require` with apostrophes

## [2.0.10] - 2019-05-31

- [#1690](https://github.com/teambit/bit/issues/1690) fix error "Cannot read property 'find' of undefined" with typescript files

## [2.0.9] - 2019-05-31

- [#1665](https://github.com/teambit/bit/issues/1665) fix resolve-modules prefix with tilda

## [2.0.8] - 2019-05-27

- add support with `optionalChaining` and `nullishCoalescingOperator` plugins (by updating node-source-walk)

## [2.0.7] - 2019-05-17

- ignore import/require from CDN (http/https)

## [2.0.6] - 2019-05-16

- fix identification of link files to take into account not only the `import` statements but also `export`

## [2.0.5] - 2019-05-01

- fix es6 with dynamic import to not show as missing dependencies
- improve performance by lazy load all external packages and internal files

## [2.0.4] - 2019-03-10

- support scoped packages when resolving package.json directory of a package

## [2.0.3] - 2019-02-24

- upgrade to babel 7
- resolve symlink packages as packages when custom-resolve-modules is used
- fix resolve dependencies cache to include parsing errors

## [2.0.2] - 2019-02-08

- fix "Maximum call stack" error when resolving js files after css files

## [2.0.1] - 2019-02-04

- fix parsing `.tsx` files

## [[2.0.0] - 2019-02-04](https://github.com/teambit/bit-javascript/releases/tag/v2.0.0)

- update node-source-walk package to support `<>` jsx syntax by Babel
- support mix syntax of typescript and javascript inside .ts file
- fix ampersand and minus sings causing parse error in css files
- fix dependency resolver cache to not be accidentally overridden
- fix a warning about mismatch typescript versions
- replace the deprecated typescript-eslint-parser with @typescript-eslint/typescript-estree
- replace css parser (gonzales-pe -> css-tree) for better import syntax support
- expose precinct lib as getDependenciesFromSource
- replace Caporal package with Commander to parse cli input
- update mocha-appveyor-reporter for security reasons
- support other script languages (such as typescript) inside Vue files
- utilize the cache mechanism of dependency-tree to cache resolved dependencies
- fix resolving npm paths to be linked to the correct file
- fix symlinks to node_modules to be recognized as modules instead of files
- fix get-dependency command to cache processed files
- improve the scalability of the dependency resolution
- add detective-css (before it was using detective-sass for css files)
- avoid suppressing parsing errors for css, sass, scss and less

## [1.0.5] - 2018-07-24

- update typescript package
- fix error "Cannot read property 'missing' of undefined" when a dependency of dependency has parsing errors
- fix vulnerabilities reported by npm audit

## [1.0.4] - 2018-07-12

- fix error "Cannot read property push of undefined" when a dependent has parsing error
- avoid parsing unsupported dependencies files

## [1.0.3] - 2018-07-10

- fix error "Cannot read property push of undefined" when a resolver throws an exception
- fix the resolver for an unknown extension
- bug fix - on Linux module path (require('a.js')) is resolved as relative path (require('./a.js'))
- improve the tree shaking mechanism to work with unlimited number of intermediate (link) files
- fix parsing error when a Vue file has a dependency prefix with a Tilde inside a style section
- fix resolution of style files (.scss, .css, .sass, .less) when required with no extension
- remove .json extension from the supported-files list as it doesn't have dependencies
- avoid passing unsupported files to the parser
- add parsing and resolving errors to the dependency tree
- add missing dependencies to the dependency tree
- fix detection of "export * from" syntax of ES6
- fix "Cannot read property 'lang' of null" error when resolving Vue dependencies

## [1.0.2] - 2018-06-26

- fix .tsx parsing issue when the tsx dependency is required from a non .tsx file
- fix support of .json dependencies
- fix "SyntaxError: Unexpected token" when parsing .ts files with .js dependencies

## [1.0.0] - 2018-06-18

- support custom module resolution
- support mixed mode of common-js and ES6 ("require" and "import" together)
- support "export X from Y" syntax of ES6 without importing X first
- fix handle tsx files when detectiveOption is empty
- bug fix - packages on d.ts files were not recognized
- lock stylable version since the new version no longer support node 6
- fix issue with load package dependencies when main file not in the root of the package

## [0.10.16] - 2018-05-09

- support for bit login (set registry with token in npmrc file)
- adding scss to support ~

## [0.10.15] - 2018-04-19

- fix resolve-node-package process for Windows

## [0.10.14] - 2018-04-10

- support link-files with "export { default as ... }"; syntax
- fix merge of madge dependencies with package.json dependencies with dot in them

## [0.10.13] - 2018-03-21

- fix issue with stylus files inside vue-lookup

## [0.10.12] - 2018-03-12

- insert dependency-resolutions packages code into this repo.

## [0.10.11] - 2018-02-27

- support dependency detection for Vue files

## [0.10.10] - 2018-01-30

- restore old behavior of requiring package installation

## [0.10.9] - 2018-01-24

- support case when there is no package.json
- support removing components from workspaces and dependencies in package.json

## [0.10.8] - 2018-01-18

- remove pack command
- support yarn workspaces in package.json
- remove auto generated post install scripts
- fix bug with package.json without dependencies
- fix bug with resolve dependencies from package.json
- dont try to resolve dependencies from package.json if dosent exist
- dont show missing packages if they appear in package.json
- add a new method to PackageJson class: addComponentsIntoExistingPackageJson

## [0.10.7] - 2017-11-29

- Stylable support
- improve stability and performance of resolving dependencies
- change post install hook to work with symlink
- bug fix - components that require dependencies with custom binding prefix were not recognized

## [0.10.6] - 2017-11-12

- add pack command to create tgz for components

## [0.10.5] - 2017-10-19

- Identify dependencies that are link files (files that only require other files)
- Add a CLI command to easily get dependencies for a file
- Support semver in packages dependencies
- Add support for bindingPrefix

## [0.10.4] - 2017-10-01
- Add support for writing package.json files
- Support .tsx files

## [0.10.3] - 2017-08-23
- Improve windows support
- change back Madge version to the NPM package as it now supports TypeScript

## [0.10.2] - 2017-08-15

- Use a forked version of madge for better ts support
- Improve resolving packages dependencies (remove duplicates)

## [0.10.1] - 2017-08-07
- Improve resolving packages dependencies for ts files

## [0.10.0] - 2017-08-07
### BREAKING CHANGES

- Upgrade: Bit now works with a new set of APIs and data models for the code component and scope consumer.
- Important: Bit is not backward compatible with remote scopes running older versions of Bit.

## [0.6.4] - 2017-06-25

## [0.6.4-rc.1] - 2017-06-07

- create inner dependency links for all components in components directory.
- support latest tag on bind process.
- persist only in the end of the bind process.
- fix the file-extension of the dist file to be based on the language defined in bit.json
- fix bind of dependencies of dependencies
- remove watch command
- [bind] also create links for inline_components dependencies in the components directory

## [0.6.3] - 2017-05-21

- fix to generation of links for inline-components

## [0.6.1] - 2017-05-18

- fixed watcher and import command
- generate dependencies links for inline-components

## [0.6.0] - 2017-05-15

- exclude dynamic compile behavior

## [0.5.12] - 2017-05-14 rc

- dynamically compile an impl file for inline-components on development environment

## [0.5.11] - 2017-05-11 rc

- add onModify hook
- create public-api for the dependencies root.

## [0.5.8] - 2017-05-11 rc

- fix binding dependencies when using a non-hub scope.
- create public-api for the dependencies namespaces.

## [0.5.7] - 2017-05-10 rc

- fix public api namespace destructuring for bind specific components

## [0.5.4] - 2017-05-09 rc

- support binding specific components
- support passing a directory as a parameter to the `bind` function.
- change the dist/dist.js constant to be dist/\<implFileName> when performing the bind process
- add public-api for pending export components (staged components, that were commited and didn't exported yet).
- major refactor + remove old deprecated behavior (the load function)
- change name to bit-javascript

## [0.5.3] - rc (2017-04-23)

- support require('bit/namespace').component and import { component } from 'bit/namespace' syntax.
- write a default bit.json if not exists
- keep the bit-module in sync with the components map (e.g. remove the node_modules/bit module on every bind action)

## [0.5.1] - rc (2017-04-16)

- implemented watch for inline_components and bit.json, call bind on every change.

## [0.5.0] - rc (2017-04-16)

- add pretty error handling to the command registrar
- Move the writing-to-fs functionality to [bit-scope-client](https://github.com/teambit/bit-scope-client) project
- Add opts to the load function
- Add resolve function
- Fix dist bug
- add sourcemaps
- update bit-scope-client to version 0.5.2
