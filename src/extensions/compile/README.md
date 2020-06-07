### Workspace Configuration

The compiler is configured inside an environment and not directly on the component level.

## As a task
A task is running with `bit run` or during the tag process on the capsules or the workspace (depends on the specific compiler implementation).
The env extension should have this compiler extension as a dependency first, then add to the `release()` array the following: `this.compile.task`.

## As a command
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

### Compiler Implementation
The compiler is responsible for two processes:
1. compile during development
This compilation takes place on the workspace and the dists are saved inside the component dir.
The provider should implement `compileFile` function as follows:
```
compileFile: (fileContent: string, options: { componentDir: string, filePath: string }) => Array<{ outputText: string, outputPath: string }> | null;
```
In case the compiler receive an unsupported file, it should return null.

2. compile for release (during the tag command)
This compilation takes place on the isolated capsule.
The provider should implement `compileOnCapsules` function which returns the exit-code and the dist dir.
From Compiler interface:
```
compileOnCapsules(capsuleDirs: string[]): { resultCode: number; error: Error | null };
```
FYI, this api is going to be changed very soon. It should get components and capsules graph.