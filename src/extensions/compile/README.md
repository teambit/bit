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
The provider should implement `defineCompiler` function which returns the filename of the task file without the extension.
An example:
```
const defineCompiler = () => ({ taskFile: 'transpile' });
```