# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
and this project adheres to [Semantic Versioning](http://semver.org/).

## [unreleased]

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
