---
id: typescript
title: Typescript
slug: /aspects/typescript
description: Typescript compilation for Bit components.
labels: ['typescript', 'compiler', 'bit', 'extension', 'aspect']
---

Typescript aspect implements the `Compiler` interface and provides the ability to transpile files on the workspace and build components in the isolated capsules.

## Configuration - tsconfig.json
An env that uses typescript compiler can have two tsconfig.json files, one for the workspace and one for the build process.

On the workspace, the following two configurations are overridden:
```
compilerOptions.sourceRoot = componentDir;
compilerOptions.rootDir = '.';
```
The reason to override them is to make the source-map working on the workspace.

As a reminder, the `dists` are written into the node_modules and not in the component-dir, without the configuration above, the source-map won't have the correct `sourceRoot` and `sources` values, and as a result, the debugger won't work.
