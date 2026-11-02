# @teambit/envs.contracts

The types and the few runtime values that envs and their services (compilers, testers, bundlers, app types, ...) use from Bit. It installs a few small packages. Importing the same names from the core aspects (`@teambit/builder`, `@teambit/envs`, ...) installs thousands.

## Migrating an env

The contract is a regular package, so it works with any recent Bit version. An env that extends a base env (e.g. `ReactEnv`) can migrate only after its base env did.

1. Import from `@teambit/envs.contracts` instead of the core aspects (`@teambit/envs`, `@teambit/builder`, `@teambit/compiler`, `@teambit/tester`, `@teambit/generator`, `@teambit/pkg`, `@teambit/bundler`, `@teambit/application`, `@teambit/component`, `@teambit/logger`, ...). Most names are the same: `EnvHandler`, `Pipeline`, `BuildContext`, `Compiler`, `TemplateList`, `Bundler`, `AppTypeList`, `Component`, `ComponentMap`, `Logger`, ... These change:

   | Before                                                      | After                                          |
   | ----------------------------------------------------------- | ---------------------------------------------- |
   | `DocsRootProps` (`@teambit/docs`)                           | `DocsRootProps<React.ComponentType>`           |
   | `TypeScriptExtractor.from(options)` (`@teambit/typescript`) | `typescriptSchemaExtractor(options)`           |
   | `WorkspaceAspect.id`, `PubsubAspect.id`, ...                | `WORKSPACE_ASPECT_ID`, `PUBSUB_ASPECT_ID`, ... |

2. Remove the core aspects from the env's dependencies.
3. Type-check the env. When a name is missing, see below.

To use an aspect at runtime, get it from the env context, typed with the contract's narrow interface:

```ts
const workspace = context.getAspect<Workspace>(WORKSPACE_ASPECT_ID); // undefined in a scope
const pubsub = context.getAspect<PubsubMain>(PUBSUB_ASPECT_ID);
```

## When something is missing

- The contract types are narrow on purpose. `Component`, `Workspace` and the contexts have only the members envs use. At runtime the env gets the real objects, so a missing member is only missing from the type.
- To add a member or a type, copy it from the aspect. Its type must use only the contract and small packages. When it refers to an aspect type (`ScopeMain`, `ExtensionDataList`, ...), define a narrow type for it instead.
- Types that Bit passes to envs (contexts, the `Workspace`): keep a narrow copy here.
- Types and classes that envs return to Bit (results, `Pipeline`, `AppTypeList`, ...): define them only here, and re-export them from the aspect. A copy of a class with private members doesn't fit the original.
- Use the method syntax (`run(context: X): Y`) for methods whose parameter is a context. Services typed with the aspects' contexts then still fit.
- Add a line for each new type to `contracts.spec.ts`. `npm run lint` fails when the contract and the aspects drift apart.

Not in the contract:

- The webpack helpers. `WebpackConfigMutator` and `WebpackBitReporterPlugin` have their own small packages (`@teambit/webpack.modules.config-mutator`, `@teambit/webpack.plugins.webpack-bit-reporter-plugin`); import them from there, not from `@teambit/webpack`. The rest (`fallbacks`, ...) is used by the Angular envs only.
- Aspect-level APIs such as `DevFilesMain`, `ScopeMain` or the worker helpers. Code that needs them keeps importing the aspect.
