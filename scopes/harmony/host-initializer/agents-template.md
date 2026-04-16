# AGENTS.md

This file teaches AI agents how to work correctly inside a **Bit workspace**. Read it fully before touching any code.

---

## What is Bit?

Bit is a composable development platform where every piece of functionality is an independent, versioned, composed **component**. Components live in **scopes** (remote registries of business domains) and are managed through the `bit` CLI.

### Component Types

Not all components are UI widgets. In Bit, a "component" can be any of these:

| Type                 | What it is                                                                                                  | Example                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Entity**           | Plain domain object — defines the shape and behavior of a domain model. No React, no side effects.          | `entities/user`, `entities/order`    |
| **Hook**             | Encapsulates data fetching, mutations, or stateful logic for a domain. Consumed by UI components and pages. | `hooks/use-user`, `hooks/use-orders` |
| **UI component**     | Reusable visual element, typically stateless or lightly stateful.                                           | `ui/button`, `ui/card`               |
| **Feature / Aspect** | Self-contained domain slice — owns its entities, hooks, pages, and backend logic.                           | `customers`, `billing`               |
| **App**              | A standard deployable application — a React frontend, Node.js server, etc.                                  | `my-react-app`, `my-node-server`     |

Understanding which type you're working with matters because it shapes the dependency chain. A typical app looks like this:

```
App  →  Page  →  Hook (optional)  →  Entity (optional)
             ↘  UI component
```

Entities and hooks sit at the bottom of the chain — they have no dependents of their own, so changes to them propagate upward. Everything above that consumes them must be local for your changes to take effect.

The workspace is defined by `workspace.jsonc`. The owner and default scope are set there — always read them first.

---

## Project Orientation

```bash
cat workspace.jsonc                  # find owner, scope, envs
bit list                             # see what's already local
bit status                           # check for pending changes
bit templates                        # see what generators are available
```

---

## Understanding Component APIs

When you need to understand how to **use** a component (its props, function signatures, return types), prefer structured API data over reading source files:

- **Local workspace components:** run `bit schema <component-id>` — returns exported types, function signatures, and class methods.
- **Remote components:** run `bit show <owner>.<scope>/<name>` to inspect metadata and dependencies.

For understanding implementation details (how something works internally), read the source directly.

---

## Common Commands

```bash
bit status                           # workspace health + pending changes
bit start                            # dev server (default port 3000)
bit run [app_name]                   # run the app
bit list                             # all locally tracked components (do not pass args)
bit search <query>                   # search components locally and on remote scopes
bit show <owner>.<scope>/<name>      # inspect a specific component
bit schema <component-id>            # structured API of a local component
bit import "<owner>.<scope>/**"      # import all components from a remote scope
bit templates                        # list available generator templates
bit create <template> <name>         # scaffold a new component
bit install [pkg1] [pkg2] ...        # install package dependencies
bit compile                          # manual compile (usually auto — use for troubleshooting)
bit test                             # run tests
bit lint                             # run linter
bit check-types                      # TypeScript type checker
```

> **Always use `bit install`** to install packages. Never use `npm install`, `yarn`, or `pnpm` directly — they will corrupt the workspace's dependency resolution.
>
> **Use Bit for type checking and testing.** Never use `tsc` or `npx tsc` directly. Scope to specific components when useful:
>
> ```bash
> bit check-types "[component-id1, component-id2]"
> bit test "[component-id1, component-id2]"
> ```

---

## Discovering Apps

```bash
bit app list
```

Use `bit import` to fetch remote apps and run them locally.

---

## The Golden Rule: One Component at a Time

Never scaffold multiple components upfront. Bit development is an **iterative loop**:

```
render → identify gap → create ONE component → render again
```

### Step-by-step

1. **Look before you create.** Search the workspace and remote scopes first:

   ```bash
   bit search <keyword>
   bit show <owner>.<scope>/<name>
   ```

   A component may already exist locally or remotely. Don't duplicate.

2. **Identify the entry point.** Depending on what you're building, the entry point could be an app or a feature. List what exists in the scope before creating anything new.

3. **Create one component.** Scaffold it, wire it in, verify it compiles and renders.

4. **Validate before moving on:**

   ```bash
   bit status
   bit check-types
   bit test
   ```

5. **Identify the next gap.** Only then decide what the next component should be.

6. **Repeat.** Never pre-plan a list of components and create them all at once.

#### Example

Create a UI component:

```bash
bit create react pages/login --scope acme.people
```

Create a data entity:

```bash
bit create entity entities/user --scope acme.people
```

---

## Importing Components for Modification

Bit resolves **local workspace components** over their installed package versions. If you want to modify a component, it must be imported into the workspace — otherwise the app will use the published version and ignore your changes.

### The full dependency chain must be local

When modifying any component, import every component in the chain from the top down to your target:

```
App  →  Feature/Aspect  →  Page  →  UI component
```

You don't always need the full chain — only the layers in the dependency path of your change. But every layer between the entry point and your target must be local. If any layer in between is still installed as a package (not local), the app will ignore your changes to the layers below it.

**Examples:**

- Changing a UI component used by a feature page → import the feature, the page, and the UI component.
- Changing a feature's backend logic → import the app and the feature/aspect.

### Finding the component ID

```bash
cat node_modules/@<org>/<package-name>/package.json | grep -A3 '"componentId"'
# "scope": "myorg.myfeature"
# "name":  "pages/my-page"
# → component ID: myorg.myfeature/pages/my-page
```

### Importing

```bash
bit import <scope>/<name>
# e.g.
bit import myorg.myfeature/pages/my-page myorg.myfeature/pages/lobby-page
```

Imported components land at `<scope-short-name>/<name>/` in the workspace.

#### Importing whole scopes

```bash
bit import "<owner>.<scope>/**"
```

---

## Saving and Publishing Changes

**Never push directly to the main lane.** Always create a lane and submit a change request.

Git does not manage component versions in a Bit workspace — use Bit for version control of components.

```bash
bit lane create <your-lane-name>     # create a new lane
bit status                           # confirm no pending issues
bit snap --message "describe change" # persist component versions
bit export                           # push lane to remote
```

> Always run `bit lane create` first. If you're already on a non-main lane, continue using it — don't create a new one.

---

## Component Structure

Each component directory follows this convention:

| File                     | Purpose                              |
| ------------------------ | ------------------------------------ |
| `<name>.tsx`             | Main implementation                  |
| `index.ts`               | Public barrel export                 |
| `<name>.spec.tsx`        | Tests                                |
| `<name>.composition.tsx` | Live previews (shown in `bit start`) |
| `<name>.docs.mdx`        | Documentation                        |
| `<name>.mock.ts`         | Mock data / fixtures                 |
| `*-type.ts`              | Standalone type definitions          |

> Add JSDocs to exported APIs, include two to three usage examples in the `.docs.mdx`, and two to three compositions for the live preview.

---

## Import Path Convention

Components import each other using Bit's package notation:

```ts
import { Something } from '@<org>/<scope>.<namespace>.<name>';
```

Never use relative paths across component boundaries. Always use the package notation.

---

## Environment Setup

Generator environments (React, Vue, Node, Angular, etc.) are configured in `workspace.jsonc`. Some may be commented out. Enable the relevant environment before creating components for a specific framework.

---

## Key Files

| File              | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `workspace.jsonc` | Workspace config — scopes, envs, component patterns                 |
| `.bitmap`         | Auto-generated — tracks component locations. **Must be committed.** |
| `package.json`    | Usually `"type": "module"` for ES Modules                           |

---

## Runtime Code Crossing Environment Boundaries

Importing frontend modules into Node.js runtime files or Node.js modules into browser runtime files causes app initialization failures. This typically happens when `index.ts` or runtime files import/export cross-environment modules by value instead of by type.

**Rules for aspect `index.ts` files:**

- The Aspect manifest (from `*.aspect.ts`) is the **only** allowed value export. Everything else must use `export type`.
- Runtime modules (`*.node.runtime.ts`, `*.browser.runtime.ts`) must **always** be exported as types.

```ts
// ✅ Correct
export type { MyBrowser } from './my.browser.runtime.js';
export type { MyNode } from './my.node.runtime.js';
export type { User } from './user.js';
export default MyAspect;
export { MyAspect };

// ❌ Wrong — pulls frontend/backend code into the wrong runtime
export { MyBrowser } from './my.browser.runtime.js';
export { User } from './user.js';
```

**Rules for `*.node.runtime.ts` files:**

- Must not import frontend modules (React components, SCSS, browser-only libraries) by value. Use `import type` if only the type is needed.

**Rules for `*.browser.runtime.tsx` files:**

- Must not import Node.js modules (`fs`, `path`, server-only libraries) by value. Use `import type` if only the type is needed.

---

## Common Mistakes to Avoid

| Mistake                                                    | Correct approach                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Creating multiple components upfront                       | Create one, validate, then decide what's next                                                            |
| Modifying an installed (node_modules) component            | Import it with `bit import` first                                                                        |
| Importing only the target component but not its dependents | Import the full chain top-down: app → feature → page → component                                         |
| Treating all components as UI widgets                      | Understand the type first — app, feature/aspect, hook, entity, or UI component — it determines the chain |
| Pushing to the main lane                                   | Always create a lane, snap, then export                                                                  |
| Using git to version components                            | Bit manages component versions — use `bit snap` / `bit export`                                           |
| Guessing a component ID                                    | Check `package.json` under `componentId` or use `bit list`                                               |
| Creating a component that already exists                   | Always run `bit search` first                                                                            |
| Using `npm install`, `yarn`, or `pnpm`                     | Use `bit install`                                                                                        |
| Using `tsc` or `npx tsc` to check types                    | Use `bit check-types` or `bit test`                                                                      |
