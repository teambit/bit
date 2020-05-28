### Workspace Configuration

## As a task
An example:
```
"extensions": {
  "scripts": {
    "build": [
      "my-compiler:task-name"
    ],
  }
}
```
To run: `bit run build`.

## As a command
An example:
```
"extensions": {
  "compile": {
    "compiler": "my-compiler"
  }
}
```

To run: `bit compile`

### Compiler Implementation
The compiler is responsible for two processes:
1. compile during development
This compilation take place on the workspace and the dists are saved inside the component dir.
The provider should implement `compileFile` function as follows:
```
compileFile: (fileContent: string, options: { componentDir: string, filePath: string }) => Array<{ outputText: string, outputPath: string }> | null;
```
In case the compiler receive an unsupported file, it should return null.

2. compile for release (during the tag command)
This compilation take place on the isolated capsule.
The provider should implement `defineCompiler` function which returns the filename of the task file without the extension.
An example:
```
const defineCompiler = () => ({ taskFile: 'transpile' });
```
