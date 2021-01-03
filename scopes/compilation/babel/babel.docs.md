---
description: Babel compilation for Bit components.
labels: ['babel', 'compiler', 'bit', 'extension', 'aspect']
---

This compiler utilizes the programmatic API of Babel to transpile files. See the compiler-options.ts for more data how to pass Babel options to the compiler.

Note that to isolate the components from different Babel config files on the machine, the following two props are set to false (if they weren't passed in the options): `configFile` and `babelrc`.

## FAQ

*Q*: I'm getting an error about missing plugins.

*A*: make sure that workspace.jsonc has the plugins and that you ran `bit install`.
Example of the workspace.jsonc settings:
```
"my-babel-env": {
      "teambit.bit/aspect": {},
      "teambit.bit/dependency-resolver": {
        "policy": {
          "dependencies": {
            "@babel/core": "7.11.6",
            "@babel/preset-react": "7.12.1",
            "@babel/preset-env": "7.11.5",
            "@babel/preset-typescript": "7.10.4",
            "@babel/plugin-proposal-class-properties": "7.10.4"
          }
        }
      }
    },
```
2. You're not using the plugin.
The reason for the error is that Babel searches for config files in different directories. To disable this, add the following to the config you pass to the compiler:
```
{
  ...
  "babelrc": false,
  "configFile": false,
}
```
this takes care of both .babelrc and babel.config.json.
