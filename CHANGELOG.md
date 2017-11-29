# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
and this project adheres to [Semantic Versioning](http://semver.org/).

## [unreleased]

- bug fix for case sensitive input with bit add 

## [0.11.1-dev.9] - 2017-11-26

- removed `--include-imported` flags as `--all` can be used for the same functionality
- `--scope` flag can be used without `--all`
- message in tag command is now optional
- tag command now accepts version
- `--all` and `--scope` accepts version (optional for `--all` and mandatory for `--scope`)

## [0.11.1-dev.8] - 2017-11-26

- `bit import` - prevent overriding local changes unless --force flag was used 
- fixed bug on windows that created test files as components

## [0.11.1-dev.7] - 2017-11-23

- fixed bit add bug when adding test files with dsl 

## [0.11.1-dev.6] - 2017-11-22

- fixed output to be the same for tag command
- fixed bit list command display for deprecated components
- fixed bit show with compare flag to display dependencies

## [0.11.1-dev.4] - 2017-11-20

- Auto update .bit.map.json to semantic versions

## [0.11.1-dev.3] - 2017-11-19

- improve stability and performance of the dependency resolution mechanism
- don't write dists files for authored components

## [0.11.1-dev.2] - 2017-11-15
- add bit pack command to build packages for registry
- sort `bit show` and `bit list` components alphabetically
- support tagging the entire local scope and all imported components to a specific tag using `--scope` and `--include_imported` flags
- `bit status` - add a new section "deleted components" for components that were deleted from the file-system manually
- bug fix - components that were not indicated as staged-components by `bit status` were exported by `bit export`
- bug fix - tests files saved with incorrect path when `bit add` was running from non-consumer root  
- `bit add` - exclude a component when its main file is excluded 
- `bit test` - paint a summary table when testing multiple components 
- bug fix - generated .ts links were not valid

## [0.11.0] - 2017-11-12
- change versions numbers to be semantic versions
- add `--outdated` flag to `bit show` command to show the local and remote versions of a component
- add `--outdated` flag to `bit list` command to show the local and remote versions of components
- `bit show` - show components that will be tagged automatically when their dependencies are tagged
- export / import performance and stability improvements
- add plugin mechanism to support different file types
- SSH authentication can be done with SSH username and password in case a private key or an SSH agent socket is not available
- SSH is not supporting passphrase in case a private key is encrypted
- reimplement cat-object command
- `bit show` - show components that will be tagged automatically when their dependencies are tagged
- bug fix - dependencies were not written to the file-system when cloning a project with an existing bit.map file
- disable the local search
- fix a bug which prevents the ci running tests in some cases
- bug fix - re-adding a component after exporting it was considered as a new component 
- fix a bug which makes bit test command not work when a component use bit/ to require another component
- prevent bare-scope corruption when the export process fails
- fixed stderr maxBuffer exceeded bug in ci-update cmd
- fix a bug which makes imported components considered as modified
- fix typo in help man page

## [0.10.9] - 2017-10-18

- rename `bit commit` to `bit tag`
- extract only relevant dependencies from link files (files that only require other files)
- typescript - extract only relevant dependencies from link files (files that only require other files)
- take package version from package.json in the component / root folder to support semver package dependencies
- new field in bit.json (bindingPrefix) for dynamic links
- add flag to bit show to compare component in file system to last tagged component
- better handling deleted files
- improve bit add to convert files to valid bit names
- fixed - writing dist files to wrong directory during bit tag / test commands
- fixed remove of exported component
- prevent bare-scope corruption when the export process fails
- fixed stderr maxBuffer exceeded bug in ci-update cmd
- throw error when tester doesn't return any result for test file
- change the order of determine the main/index file - it's now ['js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'sass']
- improve checkVersionCompatibility between server and client
- show correct message / error when the tester has an exception during bit test
- fix bug with printing wrong id on bit tag for component in versions between 10-19
- handle invalid bit.json
- bit add on missing test file should throw an error
- prevent test files from becoming new components
- fix bug when component version is larger than 10 it won't show as staged

## [0.10.8] - 2017-10-01

- support requiring imported components using `require('bit/namespace/name')` syntax
- new remove command for removing local and remote components
- new deprecate command for deprecating local and remote components
- new move command for moving files/directories of a component to a new location
- create package.json for imported components
- exclude import-pending components from 'new components' section
- add ignore missing dependencies to commit
- save all dependencies on one configurable directory (components/.dependencies by default)
- add support for tsx files
- generate internal component links according to their compiled version
- move a re-imported component to a new location when `bit import --prefix` is used
- fix commit and export issues when dealing with more than 500 components
- fix export of large amount of data
- fix bug with commit --force when tests throws an exception
- fix bug - when you import authored component (and there is a newer version) it duplicate it in the .bit.map.json
- fix bug - when you import authored component it was added to bit.json dependencies
- fix bug with ssh2 times out on handshake

## [0.10.7] - 2017-09-07

- improve windows support
- add bit untrack command
- support CSS/less/sass/sass as main file
- support jsx extension as the main file of a component
- support adding new files to imported components
- deprecated install command
- fix the search according to search-index v0.13.0 changes
- prevent exporting a component when the same version has been exported already to the same remote scope
- avoid running the build and test processes upon `bit status`
- allow export specific components without specifying the scope-name
- avoid committing unmodified components unless `--force` flag is being used
- resolve dependencies from all component files regardless whether they are referenced from the main file
- bug fix - the author was not able to update his/her component in case it was changed in another scope
- bug fix - status command shows an error when components directory has an unreferenced (from bit.map) component
- avoid generating links for author components
- `bit import` from bit.json does not write to the file-system a dependency when it is also a direct import
- bug fix - export would hang when the ssh server was existing before closing
- don't calculate nested deps when calculating modified component during bit status/commit
- fixed exception is thrown in `bit ls` after exporting components
- removed `--cache` flag from `bit ls`
- added `--environment` option for `bit import`
- reformatted `bit import` output (components, dependencies, environments)
- remove duplication for missing packages warning
- Remove the npm tree output for component ci flow
- add verbosity option to some places
- added auto generated msg to bitmap and all generated link files
- fix a warning on the bit --version command
- support render tag in js docs
- bug fix - imported components were deleted from bit.map when importing nested components of the same scope and name
- write dist files on import according to .bit.map.json
- improve bit remote output (put it in a table)
- fix but with export when the remote has a dependency in the wrong version

## [0.10.6] - 2017-08-23

- windows support
- support auto updating of bit for npm installation
- support deleting files from a component
- improved bit help
- fix bit config command for linux
- update bit-javascript dependency
- fixed remote add exceptions to human-friendly errors
- improvement - when there are several potential main files, `bit add` selects the one that is closer to the root
- show a friendly error when SSH returns an invalid response
- fix an error when there are multiple open SSH connections
- update bit.map and the file system when a nested component is re-imported individually
- fix ci-update command when there are tester and compiler to use the same isolated-environment
- fix an error when importing a component, exporting it, modifying and exporting again (v3)
- fix links generation when importing from a non-consumer root path
- fix ci-update command to generate links when necessary
- fix Error: "Cannot find module './build/Release/DTraceProviderBindings'" when installing via Yarn
- fix the local and remote search
- fix the internal ci-update command where an environment has a tester without a compiler
- improved commit, add, export and status outputs
- support general failures on bit test (like on before)
- status output with missing dependencies
- help flags adjusted to new help
- missing dependencies formatted on commit
- sources no longer part of bit.json's defaults
- improve readme
- improve outputs
- improve windows support for import command
- exception when using `bit test` or `bit build` before adding first components
- add new flag to bit add to override or append files to bit component


## [0.10.5] - 2017-08-16
- improved commit, add, export and status outputs
- improved bit help
- Improve log files (rotate, color, prettyPrint)
- Support define dependencies for imported components
- bug fixes for export command

## [0.10.4] - 2017-08-15

- bug fix - component stays in "staged components" section after the second export
- support exporting binary files
- fix a bug when importing version 2 of a component while version 1 has been imported before
- fix a bug when exporting version 3 of a component after importing version 2
- bug fix - install test environment if not exist upon bit test
- Fix conflicts when import from bit.json more than one component with the same nested deps
- Remove duplicates from missing packages (during import) warning
- improve error on adding non existing file
- improve support for imported components as dependencies of authored components
- auto-resolve dependencies for imported components

## [0.10.3] - 2017-08-08

- fix memory leak when exporting a big amount of components
- fix running import command from a non-root directory
- support specifying multiple ids using export command
- fix the auto creating dependencies during commit
- performance improvement for status and commit

## [0.10.2] - 2017-08-07
Improve resolving packages dependencies for ts files

## [0.10.1] - 2017-08-07

## [0.10.0] - 2017-08-07
### BREAKING CHANGES

- Upgrade: Bit now works with a new set of APIs and data models for the code component and scope consumer.
- Important: Bit is not backward compatible with remote scopes running older versions of Bit.

## [0.6.6-rc.1] - 2017-06-28
- Add babel-plugin-transform-runtime to support async functions

## [0.6.5] - 2017-06-26

## [0.6.5-rc.1] - 2017-06-26
- bugfix - install drivers in scope level before test in scope
- bugfix - install drivers in scope level before build in scope
- bugfix - calling to old bind command during component e2e tests

## [0.6.4] - 2017-06-25

- update "bit-javascript" dependency to 0.6.4
## [0.6.3-rc.3] - 2017-06-15

- `bit test` shows the error stack in case of a fatal error
- add logger
- support debug-mode for e2e tests

## [0.6.3-rc.2] - 2017-06-08

- update "bit-javascript" dependency to rc ("^0.6.4-rc.1")
- Try using cache before fetching remote

## [0.6.3-rc.1] - 2017-06-06

- support running e2e tests in a dev environment where `bit` command is different (such as bit-dev)
- `bit import` no longer uses the internal cache objects to retrieve remote bit-components.
- avoid corrupted data in a scope when dependencies somehow are not being resolved.
- allow `bit init` when there is a bit.json file without the `source` or `env` attributes.
- bug fix: don't show the version-compatibility warning more than once
- remove duplications from dependencies list of `bit import` output.
- suppress dependencies list upon `bit import`, unless a flag `--display_dependencies` is being used.
- warn for missing driver
- set the file-extension of the built-dist-file according to the current language ('.js' by default)
- support async/await syntax.
- remove the injection of bit-js module into the tester environment.
- add bit-javascript as a dependency and a post install hook.
- do not show tests output in case of thrown error on commit, use verbose flag to see the error.
- parse @property tag of JSDoc
- add `bit reset` command for cancelling the last local commit
- extract the importing bit.json components functionality from `bit import` into a new command `bit install`.
- add infrastructure for e2e tests
- fix onExport hook to get called after writing dependencies to bit.json
- increased max listeners to 100 (prevent warning message)
- colored commit success message
- support for merge conflict error reporting via ssh
- docs - fix bitsrc links to work

## [0.6.2] - 2017-05-21

- [removed] JSDoc data are saved only for functions with a tag `@bit`.
- fixed component classification (local or external)

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


