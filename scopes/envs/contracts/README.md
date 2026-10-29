# @teambit/envs.contracts

The types and the few runtime values that envs and their services (compilers, testers, bundlers, app types, ...) use from Bit. It installs about 18 packages. Importing the same names from the core aspects (`@teambit/builder`, `@teambit/envs`, ...) installs thousands.

## Migrating an env

The env must run on a Bit version that includes this contract (`typescriptSchemaExtractor()` throws a clear error on older versions). An env that extends a base env (e.g. `ReactEnv`) can migrate only after its base env did.

1. Change the imports of the core aspects to `@teambit/envs.contracts`. The names are the same:

   | Before                                                                                                         | After                                          |
   | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
   | `EnvHandler`, `EnvContext`, `Env`, `*Env` interfaces (`@teambit/envs`, `@teambit/compiler`, ...)               | same names                                     |
   | `Pipeline`, `CAPSULE_ARTIFACTS_DIR`, `BuildContext`, `TaskHandler`, ... (`@teambit/builder`)                   | same names                                     |
   | `Compiler`, `Tester`, `Tests`, `Linter`, `Formatter`, `SchemaExtractor`, `Preview`                             | same names                                     |
   | `TemplateList`, `StarterList`, `ComponentTemplate`, ... (`@teambit/generator`)                                 | same names                                     |
   | `PackageGenerator` (`@teambit/pkg`), `ConfigWriterList` (`@teambit/workspace-config-files`)                    | same names                                     |
   | `Bundler`, `DevServer`, `BundlerContext`, `DevServerContext`, `Target`, ... (`@teambit/bundler`)               | same names                                     |
   | `Application`, `ApplicationType`, `AppTypeList`, `AppContext`, `AppBuildContext`, ... (`@teambit/application`) | same names                                     |
   | `Component`, `ComponentMap` (`@teambit/component`), `Logger` (`@teambit/logger`)                               | same names                                     |
   | `DocsRootProps` (`@teambit/docs`)                                                                              | `DocsRootProps<React.ComponentType>`           |
   | `TypeScriptExtractor.from(options)` (`@teambit/typescript`)                                                    | `typescriptSchemaExtractor(options)`           |
   | `WorkspaceAspect.id`, `PubsubAspect.id`, ...                                                                   | `WORKSPACE_ASPECT_ID`, `PUBSUB_ASPECT_ID`, ... |

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

Not in the contract: the webpack helpers (`@teambit/webpack`, used by the Angular envs only), and aspect-level APIs such as `DevFilesMain`, `ScopeMain` or the worker helpers. Code that needs them keeps importing the aspect.
