---
description: Generates, packs and publishes component packages
labels: ['packages', 'aspect', 'pkg']
---

Bit components can be thought of as a super-set of standard packaged node modules. Each component contains a consumable package in addition to its documentation, history and other information that enables it to be maintained independently.

Components are not only consumed as standard packages but can also be [published to NPM](/docs/packages/publish-to-npm) or any other package registry (in addition to being 'exported' to a remote scope on a bit server).

The 'pkg' aspect generates, packs and publishes component packages. That includes:

1. Allowing users to modify properties in the component's `package.json`
2. Allowing other Bit extensions to add new properties to the component's `package.json`.
3. Allowing a Bit environment to add new properties to the component's `package.json`.
4. Exposing a `pack` command to pack a component into a tar suitable for an npm registry
5. Exposing a `publish` command to publish components to a private registry
6. Utilizing the `PostTag` hook to auto publish components after tag

### Quickstart & configuration

> This aspect is only configurable using the 'variants' workspace API.

#### Package properties

Use the `packageJson` property to add or override the default `package.json` for your component packages.

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

> Auto-publishing is triggered by the "export" process only when `publishConfig` or `name` are set.

##### NPM arguments

You can specify additional arguments to the `npm publish` command by adding an array of args to `packageManagerPublishArgs`.

For example:

```js
"ui/*": {
  "teambit.pkg/pkg": {
    "packageManagerPublishArgs": ["--access public"]
  }
}
```

#### NPM

- Use the `name` property to set the publishing process to your [NPM scope](https://docs.npmjs.com/cli/v6/using-npm/scope).
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

if the main file is "index.ts", it'll be translated to `dist/index.js`.

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

Overrides the existing TAR file:

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
