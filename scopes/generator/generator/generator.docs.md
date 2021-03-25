---
id: teambit.generator/generator
title: Generator Aspect
---

Generator extension enable generating new components by pre-defined templates

### Component location

Component location in the workspace directory tree is defined with the `bit create` command (see below). For example, a component named `ShoppingCart` created in the `acme.shopper` and the namespace `ui` will be generated in the following directory:

```
acme.shopper/ui/shopping-cart
```

### Component name

When using templates Bit will use CamelCasing for passing the component-name to the template, but generated file structure should be in kebab-case, for better cross-operating-system compatibility of the component.

### Automatically `add` component

Bit should automatically register the new component to the `.bitmap` file with a symmetrical name to the component-location in the workspace.

## Register a template
Any aspect (include envs) can register templates. Each template should have a name and a list of files. Each file has a relative-path to the component-dir and template content. See the `component-template.ts` file for more info about the exact API.

* Component name should be available as a param for the file-content-template.
* TBD: An environment must have a default template (if not set, use first template in array?).

To register a template, use the Generator API: `registerComponentTemplate(templates: ComponentTemplate[])`.

To make the templates of an aspect available on a workspace, they need to be added to the workspace.jsonc. For example:
```json
"teambit.generator/generator": {
    "aspects": [
      "teambit.harmony/aspect"
    ]
  },
```
In the example above, the aspect `teambit.harmony/aspect` is configured to be available for the generator.

## Show all available templates

Introduce a new command `bit templates`, which groups all available templates by aspects.

## Generate a template from CLI

Introduce a `create` command to use templates.

```sh
bit create <template-name> <component-name...> [--scope | -s] [--namespace | -n] [--aspect | -a]
```

### Args

#### `<component name>`

Name of the component to create. Will be used as the component's dir name and fed to the component template.

**generated file structure should use kebab-case, while the template itself be in camel case**.

### Options

#### `[--scope | -s]`

Sets the component's scope and base directory. If not defined, use the `defaultScope` from `teambit.workspace/workspace` config.

#### `[--namespace | -n]`

Sets the component's namespace and nested dirs inside the scope. If not define, use empty string.

#### `[--aspect | -a]`

Aspect ID that registered this template, required only if there are two templates with the same name from several aspects in the workspace.

## Tutorial of creating a new template
1. create a new aspect "foo"
```bash
bit create aspect foo
```
2. edit the foo.main.runtime.ts file and paste the following:
```js
import { MainRuntime } from '@teambit/cli';
import { GeneratorMain, GeneratorAspect, GeneratorContext } from '@teambit/generator';
import { FooAspect } from './foo.aspect';

export class FooMain {
  static slots = [];
  static dependencies = [GeneratorAspect];
  static runtime = MainRuntime;
  static async provider([generator]: [GeneratorMain]) {
    generator.registerComponentTemplate([{
      name: 'foo',
      generateFiles: (context: GeneratorContext) => {
        return [
          {
            relativePath: 'index.ts',
            content: `export * from './${context.componentName}';`,
            isMain: true
          },
          {
            relativePath: `${context.componentName}.ts`,
            content: `export const foo = "hello template!";`
          },
        ]
      }
    }])
    return new FooMain();
  }
}

FooAspect.addRuntime(FooMain);
```
3. edit your `workspace.jsonc` file and set this foo component to use the `teambit.harmony/aspect` env.
4. edit your `workspace.jsonc` file and add the following to the root:
```
"teambit.generator/generator": {
    "aspects": ["your-scope-name/foo"]
  },
```