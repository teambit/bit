# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
and this project adheres to [Semantic Versioning](http://semver.org/).

## [unreleased]

### Fixed

- bit ls and show commands can be performed outside of bit scope

### Added

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


