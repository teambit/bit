---
displayName: PKG
description: Generates, packs and publishes component packages
labels: ['packages', 'aspect', 'pkg']
---

Bit components can be thought of as a super-set of standard packaged node modules.
Each component contains a consumable package in addition to its documentation, history and other information that enables it to be independently developed and maintained.

The PKG aspect handles the configuration, publishing and packing of component packages.
It adds its own build task to the build pipeline, to create component packages and include them in as part of the component artifacts.
This automation includes generating the package name and other properties according to the component's details.


#### Features

- **Efficient `package.json` configuration:** Use the PKG's workspace config API to add or override `package.json` properties to a group of components, all at once.
  Use PKG's 'placeholders' to integrate component-specific data into the component's package configurations.
- **An API for programmable `package.json` configuration:** Use PKG's API to provide your extensions with "packaging capabilities". Modify the `package.json` to suit your extension's needs, whether it is an environment or any other type of extension.
- **Automated packing and publishing:** - PKG is registered to your build pipeline. That means every 'build' will also test 'packing' and every tagging of a new release version will also include 'publishing'. Your components and packages versions are alway in-sync.
- **"On-demand" packing and publishing:** - PKG offers the `pack` and `preview` CLI commands for a manual and on-demand usage.

### Quickstart & configuration

> This aspect is only configurable using the 'variants' workspace API.

#### Package properties

Use the `packageJson` property to add or override the default `package.json` for your component packages.

> Warning! Packages with a modified `name` property will not be published to Bit.dev's registry.

```js
{
  "ui/*": {
    "teambit.pkg/pkg": {
      "packageJson": {
          "name": "@{scope}/{name}",
          "private": false,
          "main": "dist/{main}.js",
          "custom-prop": "value"
      }
    }
  }
}
```

#### Publish

> If `publishConfig` or `name` are not set, packages will be published to Bit.dev's registry.

##### npm arguments

You can specify additional arguments to the `npm publish` command by adding an array of args to `packageManagerPublishArgs`.

For example:

```js
"ui/*": {
  "teambit.pkg/pkg": {
    "packageManagerPublishArgs": ["--access public"]
  }
}
```

#### npmjs Registry

- Use the `name` property to set the publishing process to your [npm scope](https://docs.npmjs.com/cli/v6/using-npm/scope).
- Use the `private` _(boolean)_ property to set packages to be published with either private or public access.

```js
{
  "ui/*": {
    "teambit.pkg/pkg": {
      "packageJson": {
          "name": "@{scope}/{name}",
          "private": false,
      }
    }
  }
}
```

#### Private registry

Use the `scope` and `registry` properties to configure the publishing process to your own private registry (and scope).

```js
"ui/*": {
  "teambit.pkg/pkg": {
    "packageJson": {
       "publishConfig": {
         "scope": "@custom",
         "registry": "http://localhost:4873"
      }
    }
  }
}
```

> Packages with a modified `publishConfig` property will not be published to Bit.dev's registry.

#### Placeholders

Placeholders are an easy way to inject component-specific information into the 'pkg' configurations.

- `{name}` - The name of the component.
- `{scope}` - The name of the component scope.
- `{main}` - the name of the main file (leaving out the extension) - for example `index.js` will be `index`.

For example:

```js
 "packageJson": {
    "main": "dist/{main}.js"
  }
```

### CLI Reference

#### Pack

Creates a TAR file (to be published to a node package registry):

```shell
$ bit pack <component-id>
```

Overrides the existing TAR file (in the same location):

```shell
$ bit pack <component-id> --override

$ bit pack <component-id> -o
```

Returns the output in a JSON format:

```shell
$ bit pack <component-id> --json

$ bit pack <component-id> -j
```

#### Publish

Publishes an exported component:

```shell
$ bit publish <componentId>
```

Publishes a staged component that has not yet been exported:

```shell
$ bit publish <component-id> --allow-staged
```

Checks if the publishing process will be done successfully (without publishing):

```shell
$ bit publish <component-id> --dry-run

$ bit publish <component-id> -d
```

Returns the output as JSON:

```shell
$ bit publish <component-id> --json

$ bit publish <component-id> --j
```
