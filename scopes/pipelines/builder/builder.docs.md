---
id: builder
title: Builder
slug: /aspects/builder
description: build components on isolated directories
---
## Background
The build process is running either by `bit build` or `bit tag`. It does the following:
1) isolates components by coping them into a different directory on the filesystem.
2) runs the package-manager for all isolated components.
3) finds out what tasks to run and calculates their order (more about it down below).
4) runs the tasks one by one, such as: compile-task, test-task, etc.

## Build task
An example of a build-task is `compile`, it's written in the compiler aspect and is running on each one of the capsules created by the build process. build-tasks in many cases generate artifacts, in this case, the compiler generates `dists` files and write them on the isolated capsules. There artifacts files are used later for example when creating packages.

## List Build Tasks
To get a list of all the tasks that will be running during `bit build` on a specific component, run `bit env <id>`. Here is an example of the relevant part from the output:
```
Environment: teambit.harmony/aspect
teambit.pipelines/builder

total 7 tasks are configured to be executed in the following order
1. teambit.harmony/aspect:CoreExporter
2. teambit.compilation/compiler:BabelCompiler
3. teambit.compilation/compiler:TypescriptCompiler
4. teambit.defender/tester:TestComponents
5. teambit.pkg/pkg:PreparePackages
6. teambit.pkg/pkg:PublishDryRun
7. teambit.preview/preview:GeneratePreview
```

## Implementing Build Tasks
The `BuildTask` interface is a good start to understand how to implement a new build-task.
When writing a build task, the `Network` object is passed and it includes the seeders capsules, as well as the entire graph including the dependencies.
Keep in mind that the entire graph may contain components from other envs.

Some tasks, such as, compiling in typescript and bundling with Webpack, need the entire graph.
Others, such as, Babel, need only the seeders. However, normally, the bundling is running after the compilation and it expects to have the dependencies compiled, so you might need the entire graph regardless.

## Adding Build Tasks
There are two ways of adding tasks to the build pipeline.
1. `getBuildPipe()` method of the env.
2. registering to the slot via `builder.registerBuildTask()`.

in the option #1, it's possible to determine the order. e.g. `getBuildPipe() { return [taskA, taskB, taskC]; }`
in the option #2, the register happens once the extension is loaded, so there is no way to put
one task before/after another task.

To be able to determine the order, you can do the following
1. `task.location`, it has two options "start" and "end". the rest are "middle".
2. `task.dependencies`, the dependencies must be completed for all envs before this task starts.
the dependencies are applicable inside a location and not across locations. see getLocation()
or/and continue reading for more info about this.