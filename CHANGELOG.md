# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).
and this project adheres to [Semantic Versioning](http://semver.org/).

## [unreleased]

- [#2487](https://github.com/teambit/bit/issues/2487) - fix react docs of union type prop
- support running `bit link` for specific components
- fix capsule to not hang forever when running build/tag/isolate and npm emits errors
- [#2482](https://github.com/teambit/bit/issues/2482) - delete component's cache upon mismatch
- stabilize capsule by writing the same paths as the workspace relative to the component rootDir
- stabilize Bit by eliminating the removal of shared directory upon import and having rootDir for authored components
- fix `bit link --rewire` for css/sass/less files
- [#2171](https://github.com/teambit/bit/issues/2171) - fix ComponentNotFound when using `bit export` with no args and a flattened dependency was converted from no-scope to a remote-scope
- add infrastructure for feature-toggle
- deprecate files overrides (using file:// prefix)
- disallow adding individual files by `bit add` unless `--allow-files` flag is used
- introduce `bit link --rewire` to change relative paths in the source code to module paths
- prevent tagging components that require each other by relative paths (bypassable by `--allow-relative-paths`)
- prevent exporting components when import/require uses a module path with no scope-name

## [[14.7.7-dev.3] - 2020-03-31]

- support react-docs of multiple exports

## [[14.7.7-dev.2] - 2020-03-31]

- [#2487](https://github.com/teambit/bit/issues/2487) - fix react docs of union type prop

## [[14.7.7-dev.1] - 2020-03-24]

- fix capsule to not hang forever when running build/tag/isolate and npm emits errors
- [#2171](https://github.com/teambit/bit/issues/2171) - fix ComponentNotFound when using `bit export` with no args and a flattened dependency was converted from no-scope to a remote-scope
- fix components dependencies detection to resolve from package.json if not exist on the fs

## [[14.7.6] - 2020-02-23](https://github.com/teambit/bit/releases/tag/v14.7.6)

### Internal

- fix building binary assets

## [[14.7.5] - 2020-02-23](https://github.com/teambit/bit/releases/tag/v14.7.5)

### New

- support configuring the logger level by running `bit config set log_level <level>`.

### Changes

- support a basic flow of using module paths when no `scopeDefault` is set

### Bug Fixes

- [#2211](https://github.com/teambit/bit/issues/2211) fix `bit export` to not export non-staged dependencies
- [#2308](https://github.com/teambit/bit/issues/2308) fix "Cannot read property 'scope' of undefined" error on bit export
- [#1808](https://github.com/teambit/bit/issues/1808) fix dynamic dist reference from `package.json` when isolating via capsule
- [#2341](https://github.com/teambit/bit/issues/2341) fix `bit export --all` to successfully export when deleted from remote
- [#2268](https://github.com/teambit/bit/issues/2268) prevent logger from holding the terminal once a command is completed


## [[14.7.4] - 2020-02-06](https://github.com/teambit/bit/releases/tag/v14.7.4)

- [#2300](https://github.com/teambit/bit/issues/2300) improve `bit export` performance by pushing new tags only

## [[14.7.3] - 2020-02-02](https://github.com/teambit/bit/releases/tag/v14.7.3)

### New

- support overrides of the workspace defaultScope per components
- use workspace defaultScope to generate node-modules links for pre-export components

### Changes

- [#2247](https://github.com/teambit/bit/issues/2247) improve auto-tag output

### Bug fixes

- fix "JavaScript heap out of memory" errors during `bit export`
- [#2260](https://github.com/teambit/bit/issues/2260) fix duplicate dependencies
- [#2264](https://github.com/teambit/bit/issues/2264) fix generated dependencies links on capsule
- [#2267](https://github.com/teambit/bit/issues/2267) fix duplicate devDependencies
- [#2258](https://github.com/teambit/bit/issues/2258) don't install devDependencies packages upon extensions import
- [#2255](https://github.com/teambit/bit/issues/2255) avoid adding unneeded overrides upon import

## [[14.7.2] - 2020-01-12](https://github.com/teambit/bit/releases/tag/v14.7.2)

### New

- [#1894](https://github.com/teambit/bit/issues/1894) introduce `--remote` flag for `bit log`
- add `--conf` and `--ignore-package-json` flags to `bit checkout` similar to `bit import`

### Bug fixes

- [#2231](https://github.com/teambit/bit/issues/2231) update typescript to support optional chaining
- improve performance of `bit checkout` by writing multiple components in parallel
- fix overrides of a component added with package syntax to be recognized as bit-component
- [#2196](https://github.com/teambit/bit/issues/2196) fix dependency resolution when Bit component is imported in a sub-package

### Internal

- install librarian from npm

## [[14.7.1] - 2019-12-12](https://github.com/teambit/bit/releases/tag/v14.7.1)

### New

- add component root dir to bit show (json only)

### Bug fixes

- [#2182](https://github.com/teambit/bit/issues/2182) fix package-name replacement of dists when a package has a tilda prefix
- [#2182](https://github.com/teambit/bit/issues/2182) don't write dependencies dists to a capsule when their compiler was removed
- fix tester's isolate API

## [[14.7.0] - 2019-12-08](https://github.com/teambit/bit/releases/tag/v14.7.0)

### New
​
- Tester's API can use the `isolate` function.
- `bit status` shows untracked file dependencies recursively.
​
### Bug fixes
​
- [#2171](https://github.com/teambit/bit/issues/2171) fix component-not-found when exporting to multiple scopes and there are dependencies between them
- [#2175](https://github.com/teambit/bit/issues/2175) add missing packages from overrides to `bit status`
- [#2176](https://github.com/teambit/bit/issues/2176) fix workspace overrides to not leak rules to unrelated component
- [#2178](https://github.com/teambit/bit/issues/2178) fix adding ts types packages to respect overrides settings
​
### Experimental
​
- [#2162](https://github.com/teambit/bit/pull/2162) add integration with [librarian](https://github.com/teambit/librarian)

## [[14.6.0] - 2019-11-24](https://github.com/teambit/bit/releases/tag/v14.6.0)

- compress ssh args before sending
- add new global config `ssh_no_compress`

## [[14.5.0] - 2019-11-24](https://github.com/teambit/bit/releases/tag/v14.5.0)

### New

- support anonymous authentication for remote read operations
- add `--token` flag for commands that runs against a remote server
- [#2101](https://github.com/teambit/bit/issues/2101) suggest matching commands

### Changes

- improve loader when building components
- add `--no-warnings` flag to bit test child process

### Bug fixes

- [#2147](https://github.com/teambit/bit/issues/2147) fix overrides to respect dependencies received by a compiler/tester/extension
- fix symlink errors when generating links to `d.ts` files
- [#2140](https://github.com/teambit/bit/issues/2140) update bit-javascript to support `import { x as y }` syntax
- fix fork of a component when a dependency exists in an older version only
- update `react-docgen` version from `2.21.0` to `4.1.1`
- keep flattened dependencies saved by auto-tag up to date, although they're not part of the current tag
- show a message about missing test files in the compiled files

### Experimental

- expose buildOne and buildAll for programmatic api (Experimental)

### Internal

- consolidate isolation options
- formalize isolate api result

## [[14.4.3] - 2019-10-23](https://github.com/teambit/bit/releases/tag/v14.4.3)

### Bug fixes

- lock memfs package version to v2.15.5 due to issues with the v2.16.0

## [[14.4.2] - 2019-10-23](https://github.com/teambit/bit/releases/tag/v14.4.2)

### Bug fixes

- [#2024](https://github.com/teambit/bit/issues/2024) rebuild components upon dependencies changes for compilers that build dependencies
- [#2067](https://github.com/teambit/bit/issues/2067) fix `bit checkout` to not duplicate modified files when the shared dir has changed
- [#2079](https://github.com/teambit/bit/issues/2079) update bit-javascript to fix error when Yarn workspaces uses nohoist
- [#2072](https://github.com/teambit/bit/issues/2072) update bit-javascript to support React fragments

### Experimental

- [#2066](https://github.com/teambit/bit/issues/2066) introduce `--skip-auto-tag` flag for `bit tag`

### Internal

- move from flow to typescript

## [[14.4.1] - 2019-10-06](https://github.com/teambit/bit/releases/tag/v14.4.1)

### Bug fixes

- [#2019](https://github.com/teambit/bit/issues/2019) fix `bit import --merge` to not override changed dependencies
- [#2023](https://github.com/teambit/bit/issues/2023) better handle external errors from compilers
- [#2013](https://github.com/teambit/bit/issues/2013) fix bit import when one module resolution alias is a directory of another alias for extensions other than `.js`
- [#2033](https://github.com/teambit/bit/issues/2033) improve bit link to build unrecognized missing links
- [#2035](https://github.com/teambit/bit/issues/2035) fix "unable to manually add the dependency" error when package.json of an imported component is missing
- [#2034](https://github.com/teambit/bit/issues/2034) make sure versions are not deleted upon tag when components have cycle dependencies and a version is specified
- [#2027](https://github.com/teambit/bit/issues/2027) fix ComponentNotFound error when building a typescript component and its Bit dependency is installed as a package
- [#2011](https://github.com/teambit/bit/issues/2011) update dependents package.json files when ejecting dependencies
- fix bit graph edge colouring for regular dependencies
- call pre and post export hooks actions

## [[14.4.0] - 2019-09-24](https://github.com/teambit/bit/releases/tag/v14.4.0)

### New
- [#1981](https://github.com/teambit/bit/issues/1981) allow compilers to add all dependencies types and not only devDependencies

### Changes
- [#2004](https://github.com/teambit/bit/issues/2004) ask for approval before exporting a component to another scope (fork)

### Bug fixes
- [#2013](https://github.com/teambit/bit/issues/2013) fix bit import when one module resolution alias is a directory of another alias
- block tagging components with prerelease versions
- fix "Converting circular structure to JSON" error when logging a circular metadata object
- fix exporting to a different scope than workspace configuration of `defaultScope`
- fix exporting components with and without scope at the same time
- [#1999](https://github.com/teambit/bit/issues/1999) show a descriptive error when a component is missing from the scope

### Experimental
- [#1956](https://github.com/teambit/bit/issues/1956) introduce a new flag `--rewire` for `bit export` to replace the import/require statements in the source to the newly exported scope

## [[14.3.0] - 2019-09-11](https://github.com/teambit/bit/releases/tag/v14.3.0)

### New
- [#1956](https://github.com/teambit/bit/issues/1956) add `defaultScope` settings in workspace config for `bit export` to use when no remote scope defined for component
- [#1990](https://github.com/teambit/bit/issues/1990) auto add `@types/package-name` for *.tsx files
​
### Changes
- generate `node_modules` links upon build for new components
​
### Bug fixes
- fail early when exporting nested dependency
- fix an error "Cannot read property log of null" upon bit log
- [#1988](https://github.com/teambit/bit/issues/1988) avoid adding a component to root package.json when importing with `--ignore-package-json` flag
- [#1972](https://github.com/teambit/bit/issues/1972) fix generated links to nested dependencies in the capsule
- [#1966](https://github.com/teambit/bit/issues/1966) prevent intermediate console printing when `--json` flag is used
- [#1721](https://github.com/teambit/bit/issues/1721) enable removing/workspace-propagating a compiler/tester from component's config
- [#1965](https://github.com/teambit/bit/issues/1965) fix generated links for `.scss` and `.sass` packages to point to the main file
- [#1959](https://github.com/teambit/bit/issues/1959) improve message when running `bit build` when compiler not configured
- fix dist replacements upon export (for angular compiler) to support require statements to an internal path
- [#1947](https://github.com/teambit/bit/issues/1947) workaround an angular-compiler issue when the dists have a prefix
​
### Experimental
- [#1956](https://github.com/teambit/bit/issues/1956) add `--include-dependencies`flag for `bit export` to be export all component-dependencies to the remote scope
- [#1956](https://github.com/teambit/bit/issues/1956) support exporting components without mentioning a remote by exporting to their last remotes

## [[14.2.4] - 2019-08-13](https://github.com/teambit/bit/releases/tag/v14.2.4)
​
### New

- [#1867](https://github.com/teambit/bit/issues/1867) apply workspace overrides config on imported components
- [#1863](https://github.com/teambit/bit/issues/1863) allow excluding components from `overrides` rules
- [#1865](https://github.com/teambit/bit/issues/1865) allow adding `package.json` props via `overrides`
- [#1837](https://github.com/teambit/bit/issues/1837) enable executing commands on remote components outside of bit-workspace
- [#913](https://github.com/teambit/bit/issues/913) add new flags to bit init `-c|--compiler`, `-t|--tester`, `-d|--default-directory`, `-p|--package-manager`
- [#1889](https://github.com/teambit/bit/issues/1889) auto add `@types/package-name` to the dependencies of TS components
- added `no_warnings` config to eliminate some warnings from being written to the stdout
​
### Changes
​
- remove Angular dependencies from bit-javascript, instead, use TS compiler to parse Angular Decorators
- [#1892](https://github.com/teambit/bit/issues/1892) deprecating `bit list --bare` and replace with `bit list --raw`
- [#1774](https://github.com/teambit/bit/issues/1774) improve access errors and warn when sudo is used
- change shortcut flag to `bit init` standalone from `t` to `T`
​
### Bug fixes
​
- safer access to bit global config
- [#1903](https://github.com/teambit/bit/issues/1903) fix importing dependents to not override dependencies
- fix capsule to respect the `override` property of vinyl files
- [#1925](https://github.com/teambit/bit/issues/1925) update bit-javascript to fix Angular non-relative paths from decorators
​
### Experimental
​
- [#1885](https://github.com/teambit/bit/issues/1885) introduce new flags `--dependents` and `--dependencies` for `bit show` to display them all recursively
- [#1908](https://github.com/teambit/bit/issues/1908) new bit init interactive
Collapse

## [[14.2.3] - 2019-07-28](https://github.com/teambit/bit/releases/tag/v14.2.3)

- [#1714](https://github.com/teambit/bit/issues/1714) auto recognize mainFile when a file added with the same name as its dir
- [#1683](https://github.com/teambit/bit/issues/1683) introduce `--namespace` flag for `bit list` to support namespaces with wildcards
- [#1727](https://github.com/teambit/bit/issues/1727) prevent saving objects that link to invalid objects
- [#1856](https://github.com/teambit/bit/issues/1856) fix links deletion from `node_modules` after installing packages by a compiler on a capsule
- [#1710](https://github.com/teambit/bit/issues/1710) improve performance of importing an entire collection

## [14.2.2] - 2019-07-24

### New

- add workspacePath and bitmapFileName to post-add hook invocation

### Changes

- improve `bit watch` to watch directories instead of only files to support addition / deletion
- [#1634](https://github.com/teambit/bit/issues/1634) improve the output of `bit watch`

### Bug fixes

- fix "Cannot read property 'push' of undefined" error upon `bit status`
- build only the component of the modified/added/removed file upon `bit watch`
- [#1668](https://github.com/teambit/bit/issues/1668) bug fix - `bit watch` doesn't update files

## [[14.2.1] - 2019-07-21](https://github.com/teambit/bit/releases/tag/v14.2.1)

### Bug fixes

- fix "Cannot read property 'length' of undefined" error upon `bit status`
- fix error "unable to link" upon `bit build` when dist is outside the components dir
- [#1705](https://github.com/teambit/bit/issues/1705) preserve newline type of `package.json` and add a newline at the end (same as NPM does)

## [[14.2.0] - 2019-07-18](https://github.com/teambit/bit/releases/tag/v14.2.0)

Bit is now available to install as a binary with all dependencies. This is the prefer method to install Bit, as it is bundled with its runtime. Note that when you install with npm / yarn Bit only supports node < `8.12.0`.

### New

- Support packaging bit-bin into a binary file according to the OS by running `npm run pkg`
- Enable compilers and testers to isolate components using capsule.
- add `--no-cache` flag to `bit ci-update` command
- [#1762](https://github.com/teambit/bit/issues/1762) allow compilers to add properties to `package.json` file.
- [#1770](https://github.com/teambit/bit/issues/1770) modify dependency links for compilers that bundle them.
- [#1663](https://github.com/teambit/bit/issues/1663) Support toposort order when compiling components.
- [#1808](https://github.com/teambit/bit/issues/1808) Adding `dist-path-template` as a `package.json` value, which gets replaced with the calculated dist path upon import.
- Generate `index.d.ts` file for `node_modules` links generated for typescript's `custom-resolve-modules`.
- Add a custom entry point file for Angular components
- Support providing different main-file for dists by a compiler
- Support identify angular dependencies

### Changes

- fix require statements to an internal package file to not include extensions if they're [.js, .ts, .tsx, .jsx]
- [#1792](https://github.com/teambit/bit/issues/1792) don't generate entry-point files for nested dependencies when their `package.json` is written
- change dependency links generated when dependencies are saved as components to be module paths and not relative paths

### Bug fixes

- [#1817](https://github.com/teambit/bit/issues/1817) fix `ComponentNotFound` error when tagging after `export`, `tag` and `untag` for author using compiler that builds dependencies.
- [#1810](https://github.com/teambit/bit/issues/1810) avoid generating link files with `.ts`, `.jsx` and `.tsx` inside `node_modules`.
- [#1807](https://github.com/teambit/bit/issues/1807) fix resolution of dependency when 2 files require it and one of them using alias
- [#1796](https://github.com/teambit/bit/issues/1796) fix dependency resolution when 2 files of component import different things from a file of another component
- [#1779](https://github.com/teambit/bit/issues/1779) update bit-javascript to prioritize custom-resolve settings
- avoid generating duplicate `require` statements within dependency links files of ES6
- update bit-javascript to fix finding tsconfig.json for Angular projects
- [#1750](https://github.com/teambit/bit/issues/1750) improve the output to clarify when a dependency package is missing
- [#1752](https://github.com/teambit/bit/issues/1752) fix dependency links generation when originally there were multiple link files
- fix `directory` flag of `bit ci-update` command
- fix installation errors on Windows related to `posix` package by replacing it with `uid-number`
- [#1734](https://github.com/teambit/bit/issues/1734) fix error "unable to add the file ..." when the require statement was of `.` or `..` as the only string

### Experimental

- add `post-add` hook
- add option to isolate component into "capsule" via `bit isolate` command

### Internal

- update execa to v2.0.3
- upgrade to babel 7

## [14.1.3] - 2019-06-06

### Bug fixes

- [#1708](https://github.com/teambit/bit/issues/1708) support `require` with apostrophes
- [#1698](https://github.com/teambit/bit/issues/1698) fix dependency version resolution when imported component requires authored component
- [#1702](https://github.com/teambit/bit/issues/1702) fix error "failed adding a symlink into DataToPersist, src is empty"
- [#1699](https://github.com/teambit/bit/issues/1699) fix config.get is not a function

## [14.1.2] - 2019-06-02

### New

- introduce a new command `bit undeprecate` to revert deprecation of components
- introduce a new flag `--machine-name` for `bit login` to help CI servers keep their token not revoked
- support `bit import` with wildcards to import an entire scope or particular namespace(s)
- support changing the log to json format by running `bit config set log_json_format true`
- add bit version validation to `bit doctor` command
- add validation for npm executable on `bit doctor`
- add validation for yarn executable on `bit doctor`

### Changes

- sort `.bitmap` component ids alphabetically to reduce chances for git conflicts (#1671)
- [#1627](https://github.com/teambit/bit/issues/1627) improve `bit tag` output
- add a suggestion to run `bit doctor` on various errors
- avoid generating links of devDependencies when installing component as packages (#1614)
- add metadata to `bit doctor` output
- update `bit add` help message with instructions for using glob patterns with `--tests`
- rewrite dependencies when installed as components even when exist to rebuild their dist directory

### Bug fixes

- [#1665](https://github.com/teambit/bit/issues/1665) fix resolve-modules prefix with Tilda
- improve sync between `.bitmap` file and the local store, see [#1543](https://github.com/teambit/bit/issues/1543) for complete use cases
- fix `bit remove` and `bit eject` to delete the dist directory when located outside the components dir
- fix `bit eject` to support component custom npm registry scope
- fix generated `package.json` when dist is outside the components dir to point the `main` to the dist file (#1648)
- ignore `import`/`require` statements from CDN (HTTP/HTTPS)
- avoid generating package.json inside node_modules for an author when one of the component files is package.json
- preserve indentation of `package.json` files and default to 2 spaces, similar to NPM (#1630)
- show a descriptive error when the dist directory configured to be outside the components dir and is missing files


## [14.1.1] - 2019-05-16

### Bug fixes

- fix bit build to not generate `index.js` files when `package.json` file already exists
- prevent overwriting author files by not writing auto-generated content on symlink files (#1628)
- avoid changing the local version of a component to the latest when exporting an older version
- fix post-receive-hook to send all exported versions and not only the latest
- fix dependency resolution to identify link (proxy) files correctly
- fix bit status to not show a component as modified after tag when the version is modified in the dependent package.json
- fix "npm ERR! enoent ENOENT" errors when importing/installing multiple components
- fix dependency value in the dependent package.json to include the path when importing them both in the same command
- fix "EEXIST: file already exists" error when running `bit link` or `bit install` and the dist is outside the component directory
- fix `bit add` to ignore directories when their files are added (#1406)

## [[14.1.0] - 2019-05-01](https://github.com/teambit/bit/releases/tag/v14.1.0)

### New

- [enable manual manipulation for component dependency resolution and environment configuration using `overrides`](http://docs.bit.dev/docs/conf-bit-json.html#overrides).

### Changes

- [moving Bit configuration to `package.json`.](http://docs.bit.dev/docs/initializing-bit.html#bit-config)
- improve performance of `bit import` by reducing memory consumption and using more cache
- reintroduce `-c` alias for `--no-cache` flag in `bit build` command
- improve authentication error message to clearly indicate the various strategies failures
- add authentication fallback to ssh-key in case the ssh-agent is enabled but failed to authenticate
- avoid installing "undefined" npm package when importing authored components
- improve Bit load time by changing bit-javascript to use lazy loading
- remove `dependencies` property from workspace `bit.json`.
- improve `bit show` to display class properties
- replace the cache mechanism from roadrunner to v8-compile-cache

### Bug fixes

- fix "EMFILE: too many open files" and "JavaScript heap out of memory" errors on `bit import`
- fix output for `bit list -j` (remove chalk characters and improve format)
- avoid reporting errors on components with dynamic import statements (#1554)
- fix tagging imported components to not loose `package.json` properties
- fix symlink generation when a binary file is required from another file within the same component using custom resolve module
- fix `bit status` to not show the component as modified when dependencies have different order
- show a descriptive error when user try to export components with private dependencies to collection under another owner
- show a descriptive error when a version object is missing

### Experimental

- `bit doctor` command and APIs to run diagnosis on a workspace

## [14.0.6] - 2019-04-16

- fix symlink to binary (or unsupported) files dependencies when installed via npm and have dists
- fix dependencies version resolution from package.json to support versions with range

## [14.0.5] - 2019-04-07

- fix `remove` command to not delete dependencies files from the scope as they might belong to other components
- fix symlink to binary (or unsupported) files dependencies when installed via npm


## [14.0.4] - 2019-03-18

- replace default bitsrc.io domain to bit.dev

## [14.0.3] - 2019-03-12

- fix importing components when one file is a prefix of the other in the same directory

## [14.0.2] - 2019-03-10

- prevent `bit init` from initialize a non-empty scope when `.bitmap` was deleted unless `--force` is used
- improve `bit tag` performance by decreasing hook logging
- validate paths properties of the workspace bit.json
- enable print log messages that start with a specific string to the console by prefixing the command with BIT_LOG=str
- improve error message when adding files outside the workspace
- show a descriptive error when npm 5.0.0 fails with `--json` flag
- fix errors "EISDIR" and "EEXIST" when generating links and files steps on each other
- fix links of exported components to node_modules for author when a file is not linkable to generate a symlink instead
- recognize scoped packages that were newly introduced to imported components
- fix error "consumer.loadComponentFromModel, version is missing from the id"
- enable removing a component that its workspace and scope representations are not in sync
- fix "error: Could not stat (filename) No such file or directory" when bit-checkout updates multiple files
- fix "JavaScript heap out of memory" when loading a large amount of components

## [[14.0.1] - 2019-02-24](https://github.com/teambit/bit/releases/tag/v14.0.1)

- show an error when deleting a global remote without `--global` flag
- show an error when deleting a non-exist remote
- enable custom resolve of aliases to symlink packages (bit-javascript)
- fix error "toAbsolutePath expects relative path"
- improve errors stack-trace readability
- index scope components to improve memory consumption and performance
- extract docs from non-tests files only
- fix `bit show --remote --json` to not crash when a component has a compiler
- fix `bit checkout` to update bit.json with the checked out version
- fix "Maximum call stack" error when resolving js files after css files (bit-javascript)
- fix `bit checkout --all` to write the correct data when some components are also dependencies of others
- fix `bit checkout` to install dependencies as packages when applicable
- fix `bit remove --remote` to show the dependents correctly
- hide component internal structure diff upon `bit diff` unless `--verbose` flag is used
- implement postinstall symlink generation for cases when custom-resolve modules is used with unsupported file (such as binary files)
- fix parsing `.tsx` files (bit-javascript)

## [[14.0.0] - 2019-02-04](https://github.com/teambit/bit/releases/tag/v14.0.0)

### Summary

*Bit’s v14 is released side-by-side with the release of the v2 for [bit.dev](https://bit.dev), Bit’s component community hub. New features for bit.dev v2 are announced in [Bit’s Blog](https://blog.bitsrc.io/).*

With over 65 new features, changes and bug fixes, v14 is Bit’s largest and richest release to date. V14 is focused on increased **stability**, **agility** and **performance**. It is is fully backwards compatible, and provides a faster and smoother workflow with improved compatibility throughout the ecosystem.

Here are some of v14's highlights:

- Improved performance for tracking, versioning and exporting components by up to **700%**.
- Dozens of bug fixes (~70% of open issues).
- New commands `watch` and `eject`.
- Dynamic namespaces support.
- Improved VueJS support.
- Improved CSS support.
- Auto generated documentation for React.

### New

- New `bit watch` command for building components upon file modifications.
- New `bit eject` for removing local components and installing them as packages by an NPM client
- Support dynamic namespaces (replaced the namespace/name format with a dynamic name that can have multiple slashes to indicate a hierarchical namespace).
- Support components with binary files (or non-supported extensions) as the only files.
- Support ids with wildcards (e.g. `bit tag "utils/*"`) for the following commands: `tag`, `untag`, `remove`, `untrack`, `checkout`, `merge`, `diff` and `export`.
- Support mix syntax of typescript and javascript inside .ts file
- Added react docs parsing to extract the description of the properties correctly.
- Support flow types in react doc generation.
- Support Vue files with typescript.
- Support configuring Git executable path.
- Support the new jsx syntax changes by Babel.
- Support print multiple external (build / test) errors.
- Support adding the project `package.json` file to a component.
- Support `import ~` from a local (authored) file to an imported sass component.
- Add programmatic API for add multiple components.
- Set the only dist file as main file in package.json (in case there is only one).
- Allow removing a component when it is invalid.

### Changes

- Improved performance for tracking, versioning and exporting components by up to 700%.
- CSS parser replaced for better import syntax support.
- Improve auto-tag mechanism to tag not only the dependents but also the dependents of the dependents and so on.
- Changed `--include-unmodified` to `--all`.
- Replace caporal package with commander for security reasons.
- Better error when a component was tagged without its dependencies.
- Make bit version command faster and support both `bit -v` and `bit -V` to get bit version.
- Update tty-table, flow-coverage-report and mocha-appveyor-reporter for security reasons.
- Improve exception handling for old clients connecting to a newer server.
- Shorten the generated component ID to the minimum possible.
- Return status code 1 when bit test has failing tests.
- Suppress an exception of directory-is-empty when adding multiple components and some of them are empty, show a warning instead.
- Improve "missing a main file" error when adding multiple components to print the problematic components.
- Improve performance by caching objects after loading them.
- Fix ci-update command with component version number.
- Fix `bit status` to not throw an exception for invalid components.
- Change `--conf` on `bit import` to be a path to the config dir.
- Replace the deprecated typescript-eslint-parser with @typescript-eslint/typescript-estree

### Bug fixes

- Fix link files generated to a package when it should point to an internal file of the package.
- Fix parsing React docs to show the `@example` tag.
- Fix running `bit link` from an inner directory for author.
- Fix ampersand and minus signs causing parse error in css files.
- Fix `bit add` to add the correct letter case even when `--main` or `--test` flags entered with incorrect case.
- Fix errors when component files require each other using module path.
- Fix dev-dependency that requires prod-dependency to include the dependency in the flattenedDevDependencies array.
- Do not delete isolated environment when running ci-update with keep flag and it throws exception.
- Fix import of components with circular dependencies.
- Fix link content generation for authored components on bit install.
- Fix bug with bit show when the remote component has config file.
- Fix context for testers during ci-update.
- Fix missing context in getDynamicPackageDependencies.
- Fix bug with bit show when scope path provided.
- Fix errors "JavaScript heap out of memory" and "Error: EMFILE: too many open files" when exporting a huge number of components.
- Fix error "link-generation: failed finding .. in the dependencies array" when a dependency has a devDependency installed as a component.
- Improve the stability of `bit export --eject` and provide some kind of rollback in case of failure.
- Fix bit-remove to delete authored component files when removing an authored component from an inner directory.

## [[13.0.4] - 2018-07-24](https://github.com/teambit/bit/releases/tag/v13.0.4)

### New
- send component origin repo in headers

### Changes
- improve `bit test` to run tests not only on new and modified components but also on auto-tag pending components

### Bug fixes
- fix `bit import` of a component with authored dependencies
- generate npm links for Vue packages correctly without adding .vue extension to the package
- fix `bit add` to not throw an error for imported components when mainFile is a relative path to consumer
- fix error "Cannot read property 'missing' of undefined" when a dependency of dependency has parsing errors (bit-javascript)

## [[13.0.3] - 2018-07-12](https://github.com/teambit/bit/releases/tag/v13.0.3)

### Bug fixes
- fix link files generation to support the plugin "add-module-export" of babel compiler
- fix error "Cannot read property push of undefined" when a dependent has parsing error (bit-javascript)
- avoid parsing unsupported dependencies files (bit-javascript)

## [[13.0.2] - 2018-07-10](https://github.com/teambit/bit/releases/tag/v13.0.2)

### New
- improve the tree shaking mechanism to work with unlimited number of intermediate files
- present parsing errors by `bit status` and prevent tagging it until fixed
- show the newly tagged version for auto-tagged components

### Changes
- rename `--ignore-missing-dependencies` flag of `bit tag` to `--ignore-unresolved-dependencies`
- avoid trying tree shaking on CommonJS code
- prevent dependency-resolver from parsing json files as they do not contain any dependency

### Bug fixes
- fix `bit status` to show a component as deleted when track-dir was deleted for authored
- fix parsing error when a Vue file has a dependency prefix with a Tilde inside a style section
- fix detection of .scss files when required with no extension
- don't break `bit status` when mainFile was deleted, instead, reflect it to the user with a suggestion
- fix detection of "export * from" syntax of ES6

## [[13.0.1] - 2018-06-26](https://github.com/teambit/bit/releases/tag/v13.0.1)

### New
- support `bit checkout latest` for checkout to the latest version
- add `--reset` flag to `bit checkout` command for removing local modifications
- add `--all` flag to `bit checkout` command for executing the checkout on all components
- add new flag `--skip-tests` to bit tag command
- add `--no-cache` flag to `bit build` command
- add `--include-unmodified` flag to `bit test` command
- add troubleshooting-isolating link to bit status

### Bug fixes
- fix .tsx parsing issue when the tsx dependency is required from a non .tsx file
- fix support of .json dependencies
- fix "SyntaxError: Unexpected token" when parsing .ts files with .js dependencies
- show environments when running bit show on remote component


## [[13.0.0] - 2018-06-18](https://github.com/teambit/bit/releases/tag/v13.0.0)

### Summary

With over 35 new features, changes and bug fixes, Bit's v13 is focused on increased **stability** with over 20 bug fixes and **support for common workflows** including [webpack resolve](https://webpack.js.org/configuration/resolve/), [tsconfig resolving](https://www.typescriptlang.org/docs/handbook/module-resolution.html), Vue resolve alias ([Vue Webpack template](https://github.com/vuejs-templates/webpack/blob/f21376d6c3165a4cf6e5ae33f71b16dd47d213e3/template/build/webpack.base.conf.js#L36)) , [Babel module resolver](https://github.com/tleunen/babel-plugin-module-resolver) etc. Here are some of v13's highlights.

- add ability to configure custom module resolution in Bit (paths and aliases), to support absolute import statements for projects that use similar features using Webpack, Typescript, Babel, Vue alias etc. [PR-#980](https://github.com/teambit/bit/pull/980), [#852](https://github.com/teambit/bit/issues/852), [#865](https://github.com/teambit/bit/issues/865), [#869](https://github.com/teambit/bit/issues/869)
- over 20 bug fixes including max call stack, import of binary files and more.
- environments transformed and refactored to act as native Bit extensions. [PR-#931](https://github.com/teambit/bit/pull/931)
- support "export X from Y" syntax of ES6 without importing X first. [PR-#981](https://github.com/teambit/bit/pull/981)
- support mixed mode of common-js and ES6. [PR-#1036](https://github.com/teambit/bit/pull/1036)
- support Installing Bit using NPM using `sudo`. [commit](https://github.com/teambit/bit/commit/b23a78d3fd8ba07507785d97a224775126c2b150).
- introducing new flags for `bit init` including `--reset` and `--reset-hard`. [PR-#1012](https://github.com/teambit/bit/pull/1012)

As a reminder, we're switching to major versions to indicate that we, like many others, have been using Bit in production for a long time. v13 follows the previous v0.12 and looking forward we'll continue to follow semver like we've done since 2016.

### New
- add ability to configure custom module resolution in Bit (paths and aliases), to support absolute import statements for projects that use similar features using Webpack, Typescript, Babel, etc.
- support "export X from Y" syntax of ES6 without importing X first.
- environments transformed and refactored to act as native Bit extensions
- introduce a new flag `bit init --reset-hard` to delete Bit files in order to start with a clean workspace
- introduce a new flag `bit init --reset` to recreate bit.json and .bitmap files in case they are corrupted
- add fork level to the `bit test` command
- inject dist dir to node_path variable during test process in order for the author to tag and test custom-resolved components
- added missing programmatic flags for bit isolate cmd
- support mixed mode of common-js and ES6 ("require" and "import" together)
- recognize packages required from d.ts files

### Changes
- remove alias t from bit test command (conflicts with tag command)
- do not override existing bit.json on bit init
- rename `no-launch-browser` to `suppress-browser-launch` in bit login flag
- version validation during `bit tag`

### Bug fixes
- fix import of binary files
- fix error "Maximum call stack size exceeded" when tagging or building a large file
- handle bit diff for local components without specifying a scope
- backward compatibility for components with environments with latest version
- show dependent component id when trying to install missing environment
- prevent overriding local tags from remote components upon import
- throw an error when auto tag components have a newer version
- after auto-tagging a component with a pending update it no longer becomes `modified`
- support for running bit log on local components without specifying scope name
- handle adding the same file with different letter cases (uppercase/lowercase)
- improve environments error handling
- support `bit move` and `bit import --path` when running from an inner directory
- `bit init` now recreates the scope.json if it does not exist

## [0.12.13] - 2018-05-09

### New
- add `bit show --compare` data into `bit diff` to easily see why a component is modified in one command
- when running bit login, also configure bitsrc registry for npm
- adding scss to support ~
- support components with cyclic dependencies
### Changes
- remove `--write` flag from `bit import`, the newly introduced `--merge` flag takes care of that
- improve merge-conflict error on export to show all components with conflicts
### Bug Fixes
- fix `bit remove` to not delete dependencies when they were imported directly
- add error handling to bit login
- improve the error-message "unexpected network error has occurred" to provide some useful data

## [0.12.12] - 2018-04-29

### New
- introduce a new command `bit diff` to show the files diff for modified components
- support importing component on top of a modified one and merging the changes by adding `--merge` flag to `bit import`
- add -x flag to import (short for --extension)

### Bug Fixes
- fix an end of line issue between os
- [#927](https://github.com/teambit/bit/issues/927) fix a case of link file (file that only requires another file) is part of the component
- fix bit-move of a directly imported dependency
- fix importing a different version of a dependent when dependencies are not saved as components
- fix Yarn install when a relative path is written into package.json
- fix bit-merge and bit-checkout commands for Windows
- bug fix - import after tag command was showing an error "Cannot read property 'hash' of undefined"
- fix bit-add to enable marking files as tests of existing components
- bug fix - in some circumstances, same link files were written in parallel, resulting in invalid content

## [0.12.11] - 2018-04-10

### New
- introduce a new command `bit merge` for merging a different version into the current version
- introduce a new command `bit use` for switching between versions
- add anonymous analytics usage with prompt
- support merging modified component to an older version of the component
### Changes
- rename the command `bit use` to `bit checkout`
- block tagging when a component has a newer version locally, unless `--ignore-newest-version` flag is used
- rename `--force` flag of `bit import` to `--override`
- change `bit list` to show only the authored and imported components, unless `--scope` flag is used
- `bit remove` removes components from a remote scope only when `--remote` flag is used
- improve the output of import command to show the imported versions
### Bug Fixes
- fix bit-install to work from an inner directory
- improve external test and build errors to show the stack
- support `export { default as }` syntax when extracting relevant dependencies from link files

## [0.12.10] - 2018-03-21

### New
- track directories for files changes and update .bitmap automatically
- show a component as modified (bit status) in case a new file has added to its rootDir or one of the files has renamed
- support updating dependencies versions from bit.json, package.json and bitmap files
- add an option to install peer dependencies in an isolated environment
- add the main file to file list if not specified during `bit add`
- add `--all` flag to `bit untrack` command

### Changes
- ignore files named 'LICENSE'
- test components candidates for auto-tag before tagging them

### Bug Fixes
- fix an issue with stylus dependencies from Vue files
- fix catastrophic backtracking when using Regex to find JSDoc
- fix environment import of latest version when an older version is imported
- fix exit status when ci-update fails
- fix bugs when running bit commands not from the workspace root

## [0.12.9] - 2018-03-14

- fix bug with exporting component to a very old scopes

## [0.12.8] - 2018-03-12

- send component's metadata to compilers
- fix `bit tag` with `--force` flag to force tagging when exceptions occurred during a test
- fix `bit test` error message to display the actual exception if occurred
- improve error message of `bit tag --verbose` when tests failed to include tests results
- improve handling of errors from compilers which return promises
- merge process.env from the main process to tester process fork
- symlink tester env in isolated envs
- bug fix - tests files were ignored during bit add when they're weren't part of the files array and .gitignore contained a record with leading exclamation mark

## [0.12.7] - 2018-02-28

- bug fix - specifying a component and its dependency as ids for bit remove was not working
- bug fix - fix remove component

## [0.12.6] - 2018-02-27

### New
- introduced a new command `bit untag` for reverting un-exported tags.
- support .vue files
- support `bit install` of specific ids
- init local scope inside .git
- support peerDependencies
- support passing arguments/flags to the package-manager by specifying them after '--' (e.g. `bit import -- --no-optional`)
- support compilers which return promises

### Changes
- save bit dev-dependencies components inside devDependencies section of package.json
- `bit status` shows a list of staged versions in 'staged components' section

### Bug Fixes
- show npm-client's warnings when they are about missing peer-dependencies
- fix outdated to print correct version numbers
- remove a modified component message
- resolving .gitignore files
- [#729](https://github.com/teambit/bit/issues/729) fix bit cc to clear module cache
- [#769](https://github.com/teambit/bit/issues/769) - prevent duplicate ids in bitmap when adding existing files
- [#736](https://github.com/teambit/bit/issues/736) - .gitignore is blocking everything

## [0.12.5] - 2018-02-06

- default `bit import` with no id to import objects only, unless `--write` flag is used
- decrease verbosity of npm during bit test
- added `--objects` flag to `bit import` for fetching objects only and making no changes to the filesystem
- bug fix - dists had incorrect paths in the model when originallySharedDir was the same as dist.entry
- strip dist.entry for imported and authored components only, not for nested.
- write .bitmap on bit init command
- aggregate dependencies and package dependencies in bit show
- add entered username from prompt to context for server side hooks


## [0.12.4] - 2018-01-30

- support separating dev-dependencies and dev-packages from dependencies and packages when they originated from tests files
- prompt user when trying to remove a component
- restore old behavior of requiring package installation
- support adding test files to existing component
- ignore tracked files when running bit add and print a warning message
- bug fix - bit test fails when the same environment installation was canceled before

## [0.12.3] - 2018-01-28

- avoid overriding not only modified components but also new components when running `bit import`, unless `--force' flag is used
- validate version number during tag action
- allow `bit config` to run in non initialized directory

## [0.12.2] - 2018-01-24

### New
- [#653](https://github.com/teambit/bit/issues/653) read config keys from Git config in case it's not found in bit config
- [#516](https://github.com/teambit/bit/issues/516) add `--eject` flag for `bit export` for quickly remove local components after export and install them by the npm client
### Changes
- `bit build` with no parameter, builds all authored and imported components regardless whether they're modified
### Bug Fixes
- `bit move` - updates links to node_modules and updates package.json dependencies with the new directory
- install missing environments before start build / test process
- print message in case of cyclic dependencies
- fixed ci-update from failing when no compiler or tester

## [0.12.1] - 2018-01-22

- add link-file for authored exported components from the root node_modules of a component to its main-file
- avoid fetching the dependencies of versions older than the current imported one
- migration - remove latest from compiler
- fix bug with importing old components with compiler defined
- fixed deserialize bug with bit remove

## [0.12.0] - 2018-01-18

### New
- [extension system (beta)](https://docs.bit.dev/docs/ext-concepts.html)
- [#540](https://github.com/teambit/bit/issues/540) support Yarn as package manager
- `bit import`: install hub dependencies as npm packages by default
- `bit import`: install npm packages by default
- [#613](https://github.com/teambit/bit/issues/613) `bit install` command to install all packages and link all components
- [#577](https://github.com/teambit/bit/issues/577) auto add workspaces to root package.json
- [#515](https://github.com/teambit/bit/issues/515) save direct dependencies in package.json with relative paths
- [#571](https://github.com/teambit/bit/issues/571) apply auto-tagging mechanism for imported components
- [#541](https://github.com/teambit/bit/issues/541) add package manager config to bit.json
- support saving dists files on a pre-configured directory relative to consumer root
- support `bit show --compare` with json format


### Changes
- change auto-generated node_modules links to be the same as NPM installation of components (@bit/scope.box.name)
- rename `bit bind` command to `bit link`
- reanme {PARENT_FOLDER} variable to {PARENT} in dsl of add
- rename .bit.map.json to .bitmap
- avoid writing long files paths for imported components when there is a shared directory among the component files and its dependencies
- `bit log` now shows semver instead of version hash
- [#537](https://github.com/teambit/bit/issues/537) rename dist flag to --ignore-dist and by default create dist files
- [#527](https://github.com/teambit/bit/issues/527) rename structure property in bit.json
- remove 'dist' attribute from root bit.json by default
- rename `no_dependencies` flag to `no-dependencies` on `bit import`
- rename `no_package_json` flag to `ignore-package-json` on `bit import`
- change `bit remote rm` to `bit remote del`
- run bit init automatically if dir is not initialized but contains .bitmap file
- do not write the component's bit.json file, unless `--conf` flag is set
### Bug Fixes
- [#517](https://github.com/teambit/bit/issues/517) when a nested dependency is imported directly, re-link all its dependents
- [#608](https://github.com/teambit/bit/issues/608) absolute components dependencies for new components throw an error
- [#605](https://github.com/teambit/bit/issues/605) component with modified dependencies doesn't recognize as modified
- [#592](https://github.com/teambit/bit/issues/592) auto-tagged component were not shown as staged in bit status
- [#495](https://github.com/teambit/bit/issues/495) support adding files to imported components and ignoring existing files
- [#500](https://github.com/teambit/bit/issues/500) files added under one component although it was not specified
- [#508](https://github.com/teambit/bit/issues/508) componentsDefaultDirectory do not support anything other than one dynamic param per folder
- [#543](https://github.com/teambit/bit/issues/543) remove imported component not working
- avoid building process when a component was not modified
- prevent overriding index file if exists

## [0.11.1] - 2017-11-29

- support tagging the entire local scope and all imported components to a specific tag using `--scope` and `--include_imported` flags
- add bit pack command to build packages for registry
- tag command now accepts a version
- `bit test` - paint a summary table when testing multiple components
- `bit status` - add a new section "deleted components" for components that were deleted from the file-system manually
- `bit import` - prevent overriding local changes unless --force flag was used
- sort `bit show` and `bit list` components alphabetically
- Auto update .bit.map.json to semantic versions
- improve stability and performance of the dependency resolution mechanism
- removed `--include-imported` flags as `--all` can be used for the same functionality
- `--scope` flag can be used without `--all`
- message in tag command is now optional
- `--all` and `--scope` accepts version (optional for `--all` and mandatory for `--scope`)
- fixed bug on windows that created test files as components
- fixed bit add bug when adding test files with DSL
- fixed output to be the same for tag command
- fixed bit list command display for deprecated components
- fixed bit show with compare flag to display dependencies
- don't write dists files for authored components
- bug fix - components that were not indicated as staged-components by `bit status` were exported by `bit export`
- bug fix - tests files saved with incorrect path when `bit add` was running from non-consumer root
- `bit add` - exclude a component when its main file is excluded
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
- avoid tagging unmodified components unless `--force` flag is being used
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
