# `extension @teambit/pkg`

1. allows users to change (add) properties in the component's package.json
2. allows other extensions to add new properties to the component's package.json
3. allows an env to add new properties to the component's package.json
4. exposes a pack command to pack a component into a tar suitable for an npm registry
5. exposes a publish command to publish components to a private registry
6. utilizes PostExport hook to auto publish components during export

## Usage

### Configuration

#### Workspace configuration

This extension doesn't get any configuration in the workspace level.

#### Variants configuration

This extensions gets properties to add to the package.json in the variants config in this format:

```js
{
  "ui/*": {
    "@teambit/pkg": {
      "packageJson": {
        "myPropToAdd": "propValue"
      }
    }
  }
}
```

#### Publish

Configure the `publishConfig` prop with your registry data. For example:

```js
"ui/*": {
  "@teambit/pkg": {
    "packageJson": {
       "publishConfig": {
         "scope": "@custom",
         "registry": "http://localhost:4873"
      }
    }
  }
}
```

The auto-publishing during export is triggered only when this `publishConfig` is set

#### Placeholders

* `{main}` main source file without the extension
* `{scope}` scope name
* `{name}` component name

e.g.
```js
 "packageJson": {
    "main": "dist/{main}.js"
  }
```
if the main file is "index.ts", it'll be translated to `dist/index.js`.

### Commands
This extension register a new `pack` command.
`pack <componentId> [scopePath]`

## Rational

This used mainly for this cases:
1. user who wants to add a property to the package.json. for example a component with exectuable that the user wants to add the bin property
2. extensions that wants to add props to the package.json for example a special compiler that wants to register the path to the umd file in the component compiled files.
3. A command to to pack a component into a tar suitable for an npm registry - in order to publish it to the npm registry or to private registry.

## API Usage

### slots
This extension provide an api for other extensions to add properties to the package json - `registerPackageJsonNewProps`;
This method gets an object of key<>value that represents the new props and their values.
The extension will apply those changes to the package.json only if the extension that register it is applied on the component via the variants.

### methods
A function to pack a component and generate a tarball suitable for npm registry
```js
async packComponent(
    componentId: string,
    scopePath: string | undefined,
    outDir: string,
    prefix = false,
    override = false,
    keep = false
  ): Promise<PackResult>

  /**
   * Merge the configs provided by:
   * 1. envs configured in the component - via getPackageJsonProps method
   * 2. extensions that registered to the registerPackageJsonNewProps slot (and configured for the component)
   * 3. props defined by the user (they are the strongest one)
   * @param configuredExtensions
   */
  mergePackageJsonProps(configuredExtensions: ExtensionDataList): PackageJsonProps
```

## Internal
This extension is register to the AddConfigAction exposed by the consumer component to provide the package.json new props to the legacy code.
During this process it will use the the `mergePackageJsonProps` function to calculate the final properties to add.
