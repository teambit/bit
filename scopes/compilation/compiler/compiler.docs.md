## Workspace Configuration

The compiler is configured inside an environment and not directly on the component level.

### As a task
A task is running with `bit build` or during the tag process on the capsules or the workspace (depends on the specific compiler implementation).

The env extension should have this compiler extension as a dependency first, then add to the `getBuildPipe()` array the following: `this.compiler.createTask()`.

### As a command
A command is running on the workspace.

To run: `bit compile`.

An example of configuring a compiler in the React env.
```
/**
 * returns a component compiler.
 */
getCompiler(): Compiler {
  // eslint-disable-next-line global-require
  const tsConfig = require('./typescript/tsconfig.json');
  return this.ts.createCompiler(tsConfig);
}
```

## Compiler Implementation
The compiler is responsible for two processes:

### compile during development
This compilation takes place on the workspace and the dists are saved inside the component dir.
The provider should implement `transpileFile` function as follows:
```
transpileFile: (fileContent: string, options: { componentDir: string, filePath: string }) => Array<{ outputText: string, outputPath: string }> | null;
```
In case the compiler receives an unsupported file, it should return null.

### compile for build (during the tag command)
This compilation takes place on the isolated capsule.
The provider should implement `build` function which returns the exit-code and the dist dir.
From Compiler interface:
```
build(context: BuildContext): Promise<BuildResults>;
```

## Points to consider when writing a compiler

### Debugging experience on the workspace
Since the dists are written into the node_modules/component-name/dist-dir, the debugger needs to know where to find the source files. This can be easily achieved by setting the `sourceRoot` of the source-map file to the component-dir. As a reminder, this directory is passed to the `transpile()` method.

### Error handling during build process
Without proper error handling, the `build()` will exit an the first error found. Catch the errors and add them to the `ComponentResult.errors[]` you return per component.
