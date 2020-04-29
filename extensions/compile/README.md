### Workspace Configuration

## As a task
An example:
```
"extensions": {
  "scripts": {
    "build": [
      "my-compiler"
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
