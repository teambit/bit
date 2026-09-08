# Bit Workspace — AI Agent Instructions

This file teaches AI agents how to work correctly inside a **Bit workspace**. Read it fully before touching any code.

---

## What is Bit?

Bit is a composable development platform where every piece of functionality is an independent, versioned, composed **component**. Components live in **scopes** (remote registries of business domains) and are managed through the `bit` CLI.

### Component Types

Not all components are UI widgets. In Bit, a "component" can be any of these:

| Type                 | What it is                                                                                                                                                                                          | Example                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Entity**           | Plain domain object — defines the shape and behavior of a domain model. No React, no side effects.                                                                                                  | `entities/user`, `entities/order`    |
| **Hook**             | Encapsulates data fetching, mutations, or stateful logic for a domain. Consumed by UI components and pages.                                                                                         | `hooks/use-user`, `hooks/use-orders` |
| **UI component**     | Reusable visual element, typically stateless or lightly stateful                                                                                                                                    | `ui/button`, `ui/card`               |
| **Feature / Aspect** | Self-contained domain slice — owns its entities, hooks, pages, and backend logic                                                                                                                    | `customers`, `billing`               |
| **App**              | A standard deployable application — a React frontend, Node.js server, etc.                                                                                                                          | `my-react-app`, `my-node-server`     |
| **Platform**         | The app-level composition that wires aspects together into a running system. Often named `*-platform`. Not a framework concept — just the component responsible for composing aspects into the app. | `my-platform`                        |
| **Platform aspect**  | A special aspect that exposes the registration API other aspects use to plug in (routes, backend servers, etc.). Lives as its own aspect component, typically named `platform-aspect`.              | `platform-aspect`                    |

Understanding which type you're working with matters because it shapes the dependency chain. A typical full chain of a platform looks like:

```
Platform →  Feature/Aspect  →  Page  →  Hook  →  Entity
                                     ↘  UI component
```

Where the blueprint of an app, look like this:

```
App →  Page  →  Hook (optional) →  Entity (optional)
             ↘  UI component
```

Entities and hooks sit at the bottom of the chain — they have no dependents of their own, so changes to them propagate upward. You don't need to import anything below them, but everything above that consumes them must be local for your changes to take effect.

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

## Scopes & the Bit Cloud MCP

A **scope** is a remote registry for one business domain — and the unit a full-stack feature ships as (see _Full-Stack Apps_). A component ID is `<owner>.<scope>/<name>`, optionally with a namespace before the name: `<owner>.<scope>/<namespace>/<name>`. The namespace is optional — don't add one to an ID that doesn't have it.

Anything remote — scopes, components, lanes, change requests — goes through the **Bit Cloud MCP**, not the CLI. The server advertises its own tools; two rules about _ordering_ them:

- Start with `orientation` when you don't know the account's topology, then `read_scope` to go deep on one domain. Reach for `search_components` only when you don't know which scope owns something.
- Always pass the `owner` from `workspace.jsonc`.

**If the MCP isn't connected, don't stop** — the CLI can read remotes too, just less efficiently. `bit list <owner>.<scope>` lists a remote scope's components, `bit show <owner>.<scope>/<name> --remote` inspects one, and `bit search <query>` searches by keyword across both the local workspace and Bit Cloud. Say that the MCP is unavailable and carry on; only scope creation has no CLI fallback.

### Creating a scope

**Don't create a scope up front — create it before you export.** `bit create <template> <name> --scope <owner>.<scope>` only records the scope ID locally, so you can build, validate and iterate against a scope that doesn't exist on Bit Cloud yet. The scope only has to exist by the time you publish, and creating one you never export to just leaves an empty scope on the account.

The gate is right before `bit export`: for every scope you're about to publish to, confirm it exists (`read_scope` → `existsOnCloud`) and create the missing ones first. An export to a scope that doesn't exist fails. `bit snap` and `bit tag` only write to the local scope, so they don't need it.

Scopes cannot be created from the CLI — use the `create_scope` MCP tool, or https://bit.cloud/create-scope in the browser.

**Look before you create.** Run `orientation` first — if the work fits a domain that already exists, put the components there. Create a scope only when the domain is genuinely new.

```
create_scope({ owner: 'acme', scopeName: 'billing', displayName: 'Billing', description: 'Invoicing and subscriptions' })
```

- `scopeName` — lowercase letters, digits and dashes, starting with a letter (2 chars minimum). The resulting ID is `<owner>.<scopeName>`.
- `owner` — defaults to the current account. You must be the account owner or an admin of that organization, otherwise the call is denied.
- `visibility` — optional, `public` or `private`. Defaults to public on the free plan and private on paid plans.
- `confirmed` — on paid plans the first call returns a **preview instead of creating**. Show it to the user, get approval, then call again with `confirmed: true`. On the free plan the scope is created on the first call.

---

## Understanding Component APIs

When you need to understand how to **use** a component (its props, function signatures, return types), use structured API data instead of reading source files:

- **Remote components**: Use `read_components` (Bit Cloud MCP) — returns structured type signatures, dependencies, and metadata in a single call. API references are included by default.
- **Local workspace components**: Run `bit schema <component-id>` — displays exported types, function signatures, and class methods.

These structured APIs are significantly more compact than reading source files. For understanding implementation details (how something works internally), use `read-file` or read the source directly.

---

## Common Commands

```bash
bit status                           # workspace health + pending changes
bit start                            # dev server (default port 3000)
bit run [app_name]                   # run the app
bit list                             # all locally tracked components (do not pass args to the command)
bit show <owner>.<scope>/<name>      # inspect a specific component
bit import "<owner>.<scope>/**"      # import all components from a remote scope
bit templates                        # list available generator templates
bit create <template> <name>         # scaffold a new component
bit install [pkg1] [pkg2] ...        # install package dependencies
bit compile                          # rebuild dist/ — automatic while bit watch/start runs, manual otherwise
bit validate                         # lint + type-check + tests (fast build)
bit test                             # run tests only
bit lint                             # run linter only
bit check-types --strict             # TypeScript type checker only (without --strict it exits 0 even on errors)
bit ripple log                       # check Ripple CI build status (auto-detects current lane)
bit ripple errors                    # show build errors for a Ripple CI job
bit ripple retry                     # retry a failed Ripple CI job
bit ripple stop                      # stop a running Ripple CI job
```

> **Never run `bit build`** unless absolutely necessary. Always use `bit validate` instead — it's faster and sufficient.
>
> **Always use `bit install`** to install packages. Never use `npm install`, `yarn`, or `pnpm` directly.
>
> **Use Bit for type checking and testing.** Never use `tsc` or `npx tsc` directly. Use `bit validate` for a full check, or scope to specific components:
>
> ```bash
> bit check-types --strict "[component-id1, component-id2]"
> bit test "[component-id1, component-id2]"
> bit validate "[component-id1, component-id2]"
> ```

---

## Discovering Apps

To list apps in the workspace run the following command:

```
bit app list
```

Use the Bit Cloud MCP to list remote apps. Use `bit import` to fetch remote apps and run them locally.

## The Golden Rule: One Component at a Time

Never scaffold multiple components upfront. Bit development is an **iterative loop**:

```
render → identify gap → create ONE component → render again
```

### Step-by-step Process

1. **Look before you create.** Search the workspace and Bit Cloud MCP first:

   ```bash
   bit list
   bit show <owner>.<scope>/<name>
   ```

   A component may already exist locally or remotely. Don't duplicate.

2. **Identify the entry point.** Depending on what you're building, the entry point could be a platform, app, or feature/aspect. Use the MCP to list what exists in the scope before creating anything new.

3. **Create one component.** Scaffold it, wire it into the app, and verify it compiles and renders.

4. **Validate before moving on:**

   ```bash
   bit validate
   ```

5. **Identify the next gap.** Only then decide what the next component should be.

6. **Repeat.** Never pre-plan a list of components and create them all at once.

#### Example Commands

Create UI component:

```bash
bit create react pages/login --scope acme.people
```

Create data entity:

```bash
bit create entity entities/user --scope acme.people
```

---

## Importing Components for Modification

Bit resolves **local workspace components** over their installed package versions. If you want to modify a component, it must be imported into the workspace — otherwise the app will use the published version and ignore your changes.

### The full dependency chain must be local

When modifying any component, import every component in the chain from the top down to your target. The chain depends on what type of component you're working with:

```
Platform  →  App  →  Feature/Aspect  →  Page  →  UI component
```

You don't always need the full chain — only the layers that are in the dependency path of your change. But every layer between the entry point and your target must be local. If any layer in between is still installed as a package (not local), the app will ignore your changes to the layers below it.

**Examples:**

- Changing a UI component used by a feature page → import the feature, the page, and the UI component
- Changing a feature's backend logic → import the platform, the app, and the feature/aspect
- Changing the platform itself → import the platform only (everything downstream will pick it up once local)

### Finding the component ID

```bash
cat node_modules/@<org>/<package-name>/package.json | grep -A3 '"componentId"'
# "scope": "myorg.myfeature"
# "name":  "pages/my-page"
# → component ID: myorg.myfeature/pages/my-page
```

### Importing Bit Components

```bash
bit import <scope>/<name>
# e.g.
bit import myorg.myfeature/pages/my-page myorg.myfeature/pages/lobby-page
```

Imported components land at `<scope-short-name>/<name>/` in the workspace.

#### Importing Entire Scopes

```bash
bit import "<owner>.<scope>/**"
# e.g.
bit import "myorg.myfeature/**"
```

## Saving and Publishing Changes

**Never push directly to the main lane.** Always create a lane and submit a change request.

Git does not exist in the workspace. Use only Bit for version control.

A **lane** collects and proposes component changes, in a similar fashion to a branch in Git. It can contain new components, changed components, and deletions. A lane is identified as `<scope>/<lane-name>` — for example `acme.billing/fix-invoice`. Never put a slash inside the lane name itself.

```bash
bit lane current                     # which lane am I on? check before anything else
bit lane create <your-lane-name>     # create a lane and switch to it
bit validate                         # confirm no build errors first
bit snap --message "describe change" # persist component versions
bit export                           # push lane to remote
```

> Always check `bit lane current` first. If you're already on a non-main lane, continue using it — don't create a new one.

> **Before exporting**, make sure every scope you're publishing to exists on Bit Cloud — check `existsOnCloud` via `read_scope` and create the missing ones with `create_scope` (see _Creating a scope_). This is the point at which a scope must exist; don't create it earlier.

### `bit snap` vs `bit tag`

Where you are decides which one you run — it is not a preference:

- **On a lane → `bit snap`.** Produces a hash, no version number. This is the default path.
- **On main → `bit tag`.** Produces a semver version. Bumps the patch by default; use `--minor` / `--major` only when the user describes a minor, major, or breaking release.

Both only write to the local scope. **`bit export` is what publishes** — until it runs, nothing has reached the remote scope or the deployment pipeline. Releasing to production from main is therefore tag _then_ export:

```bash
bit validate                         # hard gate
bit tag --message "describe release"
bit export
bit ripple log                       # post the build link straight away
```

`bit tag` is **only possible on main** — it is not a thing you can do on a lane, so there is no choice to make once `bit lane current` tells you where you are. On a lane, snap. And even on main, tagging is rejected when the scope protects `main` or the account requires review; then the lane workflow is the only path (see _When main is protected_).

Run `bit validate` before either — it's a hard gate, never snap or tag on a failing validate. And talk to the user in outcomes, not CLI verbs: "deploy to production" and "deploy to a preview lane", not "tag" and "snap".

### Change requests

After exporting, open a change request so the lane can be reviewed and released:

- `submit_change_request` (Bit Cloud MCP) — open the change request for your lane
- `list_change_requests` — check its status
- `edit_change_request` — update its title or description

Ripple CI builds every export. Run `bit ripple log` as soon as the export returns, give the user the job link straight away (see _Deploying_), and check the build is green before asking anyone to review:

```bash
bit ripple log                       # build status for the current lane
bit ripple errors                    # build errors for a failing job
bit ripple retry                     # retry a failed job
```

### After the lane is released

When the change request is **released** (merged to main), the lane is finished — but your workspace is still sitting on it. Switch back before starting anything new:

```bash
bit lane current                     # confirm which lane you're on
bit switch main                      # move the workspace to main and fetch the released versions
bit status                           # verify a clean workspace on main
bit lane remove <your-lane-name>     # optional: drop the now-merged local lane
```

Never keep snapping onto a released lane — those snaps land somewhere nobody will review again. Start the next piece of work with a fresh `bit lane create`.

### When main is protected

Scopes can protect `main`, and some accounts don't allow agents to release to it. If `bit export` or `bit tag` is rejected for that reason, do not retry and do not try to work around it — create a lane, snap, export, and open a change request instead.

---

## Component Structure

Each component directory follows this convention:

| File                     | Purpose                              |
| ------------------------ | ------------------------------------ |
| `<name>.tsx`             | Main implementation                  |
| `index.ts`               | Public barrel export                 |
| `<name>.spec.tsx`        | Vitest tests                         |
| `<name>.composition.tsx` | Live previews (shown in `bit start`) |
| `<name>.docs.mdx`        | Documentation                        |
| `<name>.mock.ts`         | Mock data / fixtures                 |
| `*-type.ts`              | Standalone type definitions          |

> Ensure proper JSDocs documentation, complete MDX docs with two to three usage examples. Add two to three composition for the component live preview.

JSDoc on exported members isn't optional polish — it's what renders as the component's API reference on Bit Cloud, and it's the first thing another agent reads when deciding whether to reuse the component. For the same reason, avoid `any` in a public signature: it erases the API for every consumer, and `bit check-types` gates publishing.

---

## Import Path Convention

Components import each other using Bit's package notation:

```ts
import { Something } from '@<org>/<scope>.<namespace>.<name>';
```

Never use relative paths across component boundaries. Always use the package notation.

---

## Environment Setup

Generator environments (React, Vue, Node, etc.) are configured in `workspace.jsonc`. Some may be commented out. Enable the relevant environment before creating components for a specific framework.

---

## Key Files

| File              | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `workspace.jsonc` | Workspace config — scopes, envs, component patterns                 |
| `.bitmap`         | Auto-generated — tracks component locations. **Must be committed.** |
| `package.json`    | Usually `"type": "module"` for ES Modules                           |

---

## Full-Stack Apps

There are two ways to compose an app. Decide before creating anything:

- **Do NOT default to Harmony/Symphony — most projects do not need it.** For personal sites, MVPs, small-to-medium apps and single-team projects, use the simple `platform` composition below.
- Use **Harmony** only for large enterprise platforms with multiple teams that need extensibility, plugin architecture and IoC — or when the user explicitly asks for it.
- To tell what an existing workspace uses: check `workspace.jsonc` for `bitdev.symphony/symphony-platform`, or the code for `symphonyPlatform`. If neither is present, use simple platform composition.
- When it's unclear which fits, ask: _"Are you building a simple app/site, or an enterprise platform that multiple teams will extend?"_

### Simple platform composition

Never hand-write boilerplate — scaffold with `bit create <template> <name>`, and run `bit templates` first to see what this workspace offers. If a template you need is missing, enable its env in `workspace.jsonc` generators.

A full-stack app is **three components composed by a platform**:

1. `bit create platform <name>-platform` — the deployable unit
2. `bit create react-app <name>-app` — the frontend
3. `bit create express-server <name>-service` — the backend (name it after its domain; use the `-service` suffix, never `-api` or `-backend`)

Then compose the app and the service in the platform and run `bit run <name>-platform`. The platform assigns ports and proxies, so the frontend never needs to know the backend port.

**Reaching the backend from the frontend.** The platform exposes the backend base URL to the React app as the `BACKEND_URL` environment variable — read it with `process.env.BACKEND_URL`:

```ts
fetch(`${process.env.BACKEND_URL}/api/users`, { credentials: 'include' });
```

Every cross-origin call to `BACKEND_URL` **must** pass `credentials: 'include'` — `credentials: 'include'` in `fetch`, or in the Apollo `HttpLink`. The platform gateway is configured for credentialed CORS (origin reflection plus `Access-Control-Allow-Credentials: true`), and without it the browser blocks the response. Do NOT add a Vite proxy or switch to relative paths as a workaround — the gateway already handles CORS correctly once credentials are included. This works the same way in Bit Cloud workspaces and in production.

MongoDB is already provisioned at `process.env.MONGO_URL`; never add an in-memory store or ask the user to set up a database.

Other common templates: `react`, `react-hook`, `react-theme` (UI); `module`, `entity`, `graphql-server` (Node).

---

## Harmony Platforms

**This section applies ONLY when the workspace uses Harmony/Symphony — if it doesn't, ignore everything here and use the simple platform composition above.**

Templates: `harmony-platform` (the platform), `aspect` (a domain that plugs into it), `platform-aspect` (the platform's entry aspect), `bit-aspect` (extend Bit itself).

An aspect is one domain's full vertical — its `*.node.runtime.ts` holds GraphQL, database and routes, its `*.browser.runtime.tsx` holds pages and routing, and neither may import the other's modules. Features register themselves into the platform; the platform never imports a feature.

### Backend Registration

All GraphQL schemas and REST routes must be registered through `symphonyPlatform.registerBackendServer`. This is the only correct way — never use `registerMiddlewares` for endpoint logic.

```ts
symphonyPlatform.registerBackendServer([
  {
    name: 'ai',       // sets the gateway prefix: /ai/...
    gql: gqlSchema,   // optional — omit if no GraphQL
    routes: [
      {
        path: '/stream',
        method: 'post',
        route: async (req, res) => { ... },
      },
    ],
  },
]);
```

### UI Layout Registration

`symphonyPlatform.registerLayoutEntry` registers a component **globally** — it renders on every page. Use it only for truly global sticky chrome like the top navigation header.

**Never use it for footers or any element that should appear on specific pages only.** Instead, import the component and render it directly inside the relevant page component(s).

```tsx
// Wrong — makes footer appear on every page, sticky
symphonyPlatform.registerLayoutEntry([{ position: 'bottom', component: () => <Footer /> }]);

// Correct — add Footer directly inside the page
export function Homepage() {
  return (
    <div>
      {/* page content */}
      <Footer />
    </div>
  );
}
```

### Gateway Routing

The Symphony gateway proxies frontend calls to the backend, stripping the aspect name prefix:

```
Frontend:  /api/{name}/{path}
Backend receives:  /{path}
```

For example, `POST /api/ai/stream` → backend receives `POST /stream`. The frontend **must always** include the `/api` prefix.

### Troubleshooting: Runtime Code Crossing Environment Boundaries

Importing frontend modules into Node.js or Node.js modules into the browser causes app initialization failures. This happens when `index.ts` or runtime files import/export cross-environment modules by value instead of by type.

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

- Must not import Node.js modules (fs, path, server-only libraries) by value. Use `import type` if only the type is needed.

---

## Deploying

**There is nothing to configure.** Exporting is deploying: Ripple CI builds the exported components, detects the app framework from the build artifacts, and deploys to a managed container automatically. Never add a deployer config or tell the user to set one up.

```bash
bit ripple log          # build status (auto-detects the current lane)
bit ripple errors       # why a build failed
bit ripple retry        # retry a failed job
```

**Give the user the build link as soon as you have it.** Right after `bit export` returns, run `bit ripple log` to pick up the job and post the link it prints — don't sit silently through the build and don't wait for it to go green. The user can watch progress themselves, and if it fails they already have the page open.

Copy that URL verbatim; never assemble one by hand. Its last segment is the job's slug, not the display name, so a hand-built link lands on "No CI job found".

Then report the outcome once it finishes. Once the build succeeds, an app that defines a deployment is live — get its URL with the `list_apps` MCP tool, don't guess or construct it:

| Exported from     | Served on        |
| ----------------- | ---------------- |
| A lane (staging)  | `*.bit-app.dev`  |
| main (production) | `*.composed.app` |

**The URL changes when a change request is merged.** The lane's `bit-app.dev` URL is not the production one — after a release, call `list_apps` again and give the user the new `composed.app` URL. Component-only releases have no URL at all, and neither does an app that defines no deployment — a green build on its own is not proof that anything was deployed. If `list_apps` gives you no URL, say so rather than implying the app is live, and point the user at the scope page instead.

Custom domains are a Bit Cloud settings flow with no CLI equivalent — send the user to `https://bit.cloud/<owner>/~settings/deployment`. Never claim to have connected a domain yourself.

---

## Troubleshooting

### The app doesn't reflect your change

**Most likely the `dist/` is stale.** Consumers import a component through `node_modules/<package>/dist/`, not its source, and `bit validate` type-checks _source_ — so it passes green while the running app still serves the old build. `bit watch` / `bit start` normally recompiles on save, but if either isn't running, or the change landed while it was down, the old `dist/` sits there.

```bash
bit compile             # rebuild dist/
# then restart the app
```

Do this **before** re-reading and re-editing files. If the source is already correct, editing it again cannot help — a passing `bit validate` plus wrong runtime behavior is the signature of this bug, not of a code error.

If compiling and restarting doesn't help, run `bit install`, then restart again.

### Seeded or mock data doesn't update

Seed logic usually writes only into an empty collection, so changing a seed or a `*.model.ts` has no effect on a database that already has rows — the stale documents stay, and may not even match the new shape. Clear the affected collections before restarting, or version the seed (write a marker document and re-seed when the version changes) so it re-runs on its own.

### GraphQL data missing or malformed

The backend schema and the query the frontend sends have drifted apart. Compare the two directly; don't debug the UI.

### Apollo test imports fail to resolve

`@apollo/client/testing` is the normal import and works on most versions. Only when it genuinely fails to resolve, import from `@apollo/client/testing/react/index.js` instead — don't rewrite an import that already works.

---

## Common Mistakes to Avoid

| Mistake                                                                         | Correct approach                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Creating multiple components upfront                                            | Create one, validate, then decide what's next                                                                             |
| Modifying an installed (node_modules) component                                 | Import it with `bit import` first                                                                                         |
| Importing only the target component but not its dependents                      | Import the full chain top-down: platform → app → feature → page → component                                               |
| Treating all components as UI widgets                                           | Understand the type first — platform, app, feature/aspect, or UI component — it determines the chain                      |
| Running `bit build`                                                             | Use `bit validate` instead                                                                                                |
| Pushing to main lane                                                            | Always create a lane, snap, then export                                                                                   |
| Using git for version control                                                   | Bit only — no git in the workspace                                                                                        |
| Guessing a component ID                                                         | Check `package.json` under `componentId` or use `bit list`                                                                |
| Creating a component that already exists                                        | Always `bit list` and search MCP first                                                                                    |
| Using `npm install`, `yarn`, or `pnpm`                                          | Use `bit install` to install packages                                                                                     |
| Using `tsc` or `npx tsc` to check types                                         | Use `bit validate`, `bit check-types`, or `bit test`                                                                      |
| Trying to create a scope from the CLI                                           | Scopes only exist on Bit Cloud — use the `create_scope` MCP tool                                                          |
| Creating a scope for a domain that already has one                              | Run `read_scope` / `list_components` first — reuse the existing scope                                                     |
| Creating a scope up front, before any code exists                               | Create it right before `bit export` — that's the only point it must exist                                                 |
| Creating a scope without asking                                                 | Confirm the name, owner and visibility with the user; on paid plans preview first, then call again with `confirmed: true` |
| Exporting, then going quiet during the build                                    | Post the Ripple CI job link as soon as `bit export` returns, then report the result                                       |
| Continuing to snap onto a lane that was already released                        | `bit switch main`, then `bit lane create` for the next piece of work                                                      |
| Making the platform import a feature aspect                                     | Inverted — the feature aspect imports the platform and registers itself                                                   |
| Importing React/SCSS in a node runtime, or Node.js modules in a browser runtime | Keep runtime code on its own side of the boundary and out of `index.ts`                                                   |
| Hand-writing a platform, aspect or app                                          | Scaffold it with `bit create` — run `bit templates` to see what's available                                               |
