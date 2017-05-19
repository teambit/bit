# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
and this project adheres to [Semantic Versioning](http://semver.org/).

## [unreleased]

- extract the importing bit.json components functionality from `bit import` into a new command `bit install`.

## [0.6.1] - 2017-05-18 rc

- JSDoc data are saved only for functions with a tag `@bit`.
- do not terminate watcher after failures.
- add the commit-log details to the Component object, so then it'll be available for `bit show --json` and `bit export`.

## [0.6.0] - 2017-05-15

- do not preserve node.js path cache for required bit-driver because it varies over time.

## [0.5.13] - 2017-05-14

- enable bit watch command -> build-all-inline on every change

## [0.5.12] - 2017-05-14

- enable "bit build --inline" command with no arguments for building all inline components

## [0.5.11] - 2017-05-11

- send a correct error message on commit with wrong id.
- add onModify hook.
- show error-message for 'bit build' when no compiler is specified.
- write dependencies on modify.
- do not write bit.json's `misc` and `lang` properties if the default value is presented.
- send correct error message when there is invalid inline id (wip).
- add bind command (which calls the driver bind command).

## [0.5.10] - 2017-05-11

- fix bug with specs that need compiling for server use

## [0.5.9] - 2017-05-11

- fix bug with specs that need compiling

## [0.5.8] - 2017-05-11

- write the specDist only if it exists

## [0.5.7] - 2017-05-10

- fix test for components without compiler

## [0.5.6] - 2017-05-10

- implement the isolated environment for build

## [0.5.5] - 2017-05-09

### Change

- bare scope test creates a new environment and runs the tests there.
- test command -i runs the tests on the file system (inline components).
- build command now saves dist/\<implFileName> && dist/\<specsFileName> for the specs file.
- change the component resolver to fetch from dist/\<implFileName> instead of dist/dist.js.

- package dependencies of environment modules would be installed at component level from now.
- npm loader would not be present, --verbose will show npm output after the installation is done.

### Fixed

- bug with environment installation (npm install at project level).

### Added

- add module 'component-resolver' to resolve a component path using its ID.
- support generating an isolated bit-component environment on-the-fly so it will be easier to run build and test from everywhere
- the compiler can implement a build method instead of compile, get an entry file and run webpack for example (wip). implemented for inline_components, and still need to implement environment module in order to fully work.
- add --skip-update option to the main bit help page.
- run some hooks (for now: onCommit, onCreate, onExport and onImport) using a language-driver
- lang attribute on the bit.json, enable language that will save on the model of the component.

## [0.5.4] - 2017-05-07

### Fixed

- ssh is exiting before writing the entire response.
- exception was thrown when trying to read non-existing private key.

## [0.5.3] - 2017-04-27

### Fixed

- put [search] index procedure under try catch, warns in case it fails.
- fixed bug with list/show remote components with misc files.

## [0.5.2] - 2017-04-27

### Fixed

- issue with npm ensure that was caused due to latest version changes
- issue with installing deps from local cache instead of external
- exit code with only numeric values

## [0.5.1] - 2017-04-18

### Added

- support adding misc files to a bit component
- enable "bit test --inline" command with no arguments (test all inline components)

### Change

- npm install for bit dependencies will work via temp package.json instead of invoking parallel npmi

### Fixed

- when exporting and missing @this, show friendly error

## [0.5.0]

** breaking change - a scope with this version won't work with consumer with lower versions **

### Change

- ssh protocol has changes and now contains headers with bit version
- do not override files upon "bit create" unless -f (--force) flag is used

### Fixed

- bit ls and show commands can be performed outside of bit scope

### Added

- if there is a difference between the versions of the remote bit and the local bit (the remote scope has a greater version) bit throws a error/warning message according to semver difference major/minor
- bit scope-config public command
- license file inflation
- scope meta model

### Removed

- bit resolver command

## [0.4.5]

### Fixed

- error message on component not found
- hotfix for multifetch bug
- add 'no results found' message on ci when there are no specs

## [0.4.4]

### Fixed

- bug fix: typo on destructuring for making export compatible

## [0.4.3]

### Fixed

- added validation on stdin readable for private cmd _put

## [0.4.2]

### Fixed

- make the ssh mechanism backwards compatible with older versions

## [0.4.1]

### Added

- put now work with stream (after export) instead of putting the data on a command argument

### Change

- replace the use of sequest module with ssh2 module directly.

## [0.4.0]

### Added

- bit cat-scope private command
- bit refresh-scope private command for updating model

### Change

- change the header of the bit-objects to contain the hash of the file as a second argument

## [0.3.4]

### Fixed

- add the hash to the header of the any bit-object

## [0.3.3]

### Fixed

- add posix as an optional dependency (windows)

### Added

- specsResults verbose output after ci-update
- add bit clear-cache cmd
- now running clear cache before bit update

## [0.3.2]

### Added

- add bit-dev script for linking dev command, for development
- circle ci integration
- package node v6.10.0 (LTS) (working for osx, debian, centos)

### Fixed

- throw the right error code when inner problem occures
- handled errors will also have exit code 1

## [0.3.0]

### Change

- saving the component id to bit.json after export is a default behavior.
- bit export --forget flag for not saving to bit.json after export.

### Fixed

- Solved bug with specsResults pass attribute not updating after ci update.

## [0.2.6]

### Fixed

- bug with @ on scope annotation
- improved readme and docs

## [0.2.5]

### Added

- documentation under ./docs
- gitbook integration

### Change

- change mock-require to mockery on testing mechanism
- support node 4 with babel-preset-env + add plugins, instead of stage-0 preset

## [0.2.4]

### Added

- add source-map support for dist (enables compiled bit debugging)

### Change

- small fix after import without peer dependencies (do not show the peer dependencies header)

## [0.2.3]

### Added

- import multiple components on one import (bit import componentA componentB)
- write components specific version in bit.json after import -s flag
- distinguish between peerDependencies and dependencies on the output of an import command

## [0.2.2]

### Added

- loader for export command

### Change

- scope now fetch devDependencies (compiler/tester) on export
- scope does not fetch devDependencies on import
- changed dev to environment flag on import command

## [0.2.1] hot-fix

fix a bug with import many ones function

## [0.2.0]

### Added

- loaders.
- stablize version.
- improve error handling.

## [0.1.0]

initial version


