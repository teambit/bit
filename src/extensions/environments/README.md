# This is a WIP, Please improve.

# Creating a new Environment
Before starting, it might be easier to re-use an existing environment, see the "Composing an Environment" section below.

To create a new environment, create a new extension, add "@teambit/environment" as a dependency and register to its slot: `envs.registerEnv(yourNewEnv);`. See the `provider` of react.extension.ts for a detailed example.

The class of the environment extension needs to implement the `Environment` interface. For now, due to types/circular constrains, it doesn't require to implement anything. However, to get a working env, you must implement the following:
```
getPipe(): BuildTask[];
```
There are the tasks that will be running on "bit tag"/"bit run". If you have a compiler setup, it should include `this.compiler.task`. Also, it is recommended to add the dry-run task of the publisher: `this.pkg.dryRunTask`.
See the react.env.ts for a detailed example.

Also, it is recommended to implement the following:
```
getCompiler(): Compiler; // if you need compiler
getTester(): Tester; // if you need tester
getDependencies(); // if you need to change/add/remove package dependencies
```

# Configure workspace to use the env

add this to your workspace.jsonc file.
```
"@teambit/envs": {
  "env": "your-new-env",
  "config": {}
}
```

# Composing an Environment
TBD