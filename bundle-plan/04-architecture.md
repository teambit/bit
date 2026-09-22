# 4. Architecture

[← back to bundle-plan index](../bundle-plan.md)

### 4.1 The three structural problems, and how each is solved

```mermaid
flowchart LR
    subgraph P1["P1 · runtime registration"]
      A1["harmony.run(requireAspects)"] --> A2["readdir(&lt;aspect&gt;/dist)"]
      A2 --> A3["require('*.main.runtime.js')"]
      A3 --> A4["XAspect.addRuntime(XMain)"]
    end
    subgraph P2["P2 · aspect definitions"]
      B1["workspace / scope aspects-loader"] --> B2["getAspectDef(id, runtime)"]
      B2 --> B3["{aspectPath, aspectFilePath, runtimePath}"]
    end
    subgraph P3["P3 · user-facing packages"]
      C1["bit install in a user ws"] --> C2["linkNonExistingCoreAspects"]
      C2 --> C3["symlink node_modules/@teambit/&lt;x&gt;"]
      C3 --> C4["user code / envs import it"]
    end
```

|        | problem                                                                        | solution                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | a bundle has no `dist/*.main.runtime.js` to `readdir` and `require`            | the generated entry does `import '@teambit/x/x.main.runtime'` for **every** core aspect, so the side effect happens at bundle-evaluation time. `requireAspects` still runs and still finds files — because of P2 — so **no runtime source change was needed**. |
| **P2** | `getAspectDef` globs `<pkg>/dist` for `*.aspect.js` / `*.<runtime>.runtime.js` | each shim emits those exact file names, re-exporting the bundle. `getAspectDef('teambit.workspace/workspace','main')` returns real paths (§7.3). **Zero changes to `core-aspects.ts`.**                                                                        |
| **P3** | users must `import '@teambit/<aspect>'`, and the linker symlinks _directories_ | the shims **are** real directories with real `package.json`s, so `DependencyLinker.linkCoreAspect` works untouched.                                                                                                                                            |

### 4.2 The shim trick

The bundle entry is generated into `node_modules/.bit-bundle/entry.ts`:

```ts
import './core-aspects-runtimes'; // 97 side-effect imports of *.main.runtime
export * from './core-aspects-exports'; // export * as workspace from '@teambit/workspace'; …
export { runBit as runBitApp } from '@teambit/bit/run-bit';
```

so `bit.app.js` exposes every core aspect's API as a named export, and each shim is two lines:

```js
// /tmp/bit-bundle/node_modules/@teambit/workspace/dist/index.js
module.exports = require('../../../../bundle/bit.app.js').workspace;
```

Node's module cache guarantees the 67 MB bundle is evaluated **once**, however many shims point at
it.

The entry deliberately **exports** `runBitApp` rather than calling it: the bundle is `require`d by
every shim, and a bundle that started the CLI on import would boot bit whenever a user's component
imported a core aspect.

### 4.3 Load flow

```mermaid
sequenceDiagram
    participant U as shell
    participant L as bin/bit
    participant B as bit.app.js
    participant H as Harmony
    U->>L: bit status
    L->>L: module.enableCompileCache()
    L->>B: require(...).runBitApp()
    Note over B: evaluating the bundle registers<br/>all 97 core main-runtimes
    B->>B: bootstrap() — graceful-fs, hook-require, node version
    B->>H: Harmony.load([CLIAspect, BitAspect], 'main', config)
    H->>H: run(requireAspects) → resolves via the shim packages
    B->>U: yargs parses & executes
```
