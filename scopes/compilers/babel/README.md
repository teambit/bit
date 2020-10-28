# Babel Compiler

## FAQ

*Q*: I'm getting an error about missing plugins.

*A*: There are two options:
1. You're using this plugin in the config passed to the compiler.
In this case, make sure that workspace.jsonc has the plugins and that you ran `bit install`.
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
