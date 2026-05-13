# Lane Compare Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the redesigned lane-compare UI from `/Users/luv/bit.dev/code/ws/new-changes` to `/Users/luv/bit.dev/code/____bit`, satisfying two hard gates: **no drawer** and **no monaco** in the entire lane-compare chain.

**Architecture:** Each existing or new bit component lives under `components/ui/...` with its own `index.ts`, source files, and an entry in `.bitmap` (scope `teambit.bit`, the workspace default). The port is mostly verbatim file copies with targeted import-path patches to point at `____bit`'s data hooks/entities. The final wiring change rebuilds the lane-compare `tabs` array in `scopes/lanes/lanes/lanes.ui.runtime.tsx` from the new non-monaco `Inline*Compare` components, replacing the previous fallback to monaco-based `componentCompareUI.tabs`.

**Tech Stack:** React + TypeScript + SCSS modules; bit aspects (`.bitmap`, `bit compile`, `bit install`); workspace data hooks from `@teambit/lanes.*` and `@teambit/component.ui.component-compare.*`.

**Spec:** `docs/superpowers/specs/2026-05-13-lane-compare-redesign-port-design.md`

**Source workspace (read-only):** `/Users/luv/bit.dev/code/ws/new-changes`
**Target workspace (this repo):** `/Users/luv/bit.dev/code/____bit`

---

## Conventions used by every task

- All paths under "Source" are absolute under `/Users/luv/bit.dev/code/ws/new-changes/`.
- All paths under "Destination" are relative to `/Users/luv/bit.dev/code/____bit/`.
- When a task says "copy `SRC` to `DST`", use `cp SRC DST` from the bash tool — verbatim.
- New bit components must be registered in `.bitmap`. Use the same shape as existing entries. **Scope and name are chosen so the resulting npm package id matches what the ported source files import.** For example: scope `teambit.code` + name `ui/inline-diff-viewer` → package id `@teambit/code.ui.inline-diff-viewer`. Each task below states the exact entry to insert. `rootDir` is independent of name/scope and may nest under `components/ui/<area>/<name>` for organization.

  General shape:

  ```jsonc
  "<rootDir-relative-to-components/>": {
      "name": "<name-that-maps-to-package-id>",
      "scope": "<scope-that-maps-to-package-id>",
      "mainFile": "index.ts",
      "rootDir": "components/ui/<path>",
      "onLanesOnly": false,
      "isAvailableOnCurrentLane": true,
      "config": {}
  }
  ```

  Add the entry in alphabetical position within `.bitmap`. The .bitmap key is conventionally the same as `name` for components at the workspace's default scope, but when the scope differs from default, look at existing analogous entries (e.g., `"ui/compare/lane-compare"` uses key matching rootDir suffix — copy that style). After editing run `bit status` to confirm bit recognises the new component.

- After each task, compile only the touched component(s): `bit compile <component-name>`. If `bit compile` fails on import resolution, run `bit install` once and retry.
- Frequent commits: one commit per task at the end of the task's last step.
- Linting: `npm run lint` runs `oxlint` + `tsc --noEmit` — defer to the end-of-phase commits (Tasks 13 and 16) to avoid noise.

## Phase summary

| Phase                         | Tasks | Output                                                                                                                            |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| A. Primitives                 | 1–4   | `diff-mode-context`, `file-registry`, `compare-toolbar`, `compare-sidebar`                                                        |
| B. Non-monaco diff foundation | 5–6   | `inline-diff-viewer`, `deps-diff-table`                                                                                           |
| C. Inline tab components      | 7–11  | `inline-code-compare`, `inline-tests-compare`, `inline-config-compare`, `inline-preview-compare`, `inline-deps-compare`           |
| D. Compare shell              | 12–13 | `InlineComponentCompare` / `ComponentCompareHeader` injected into existing `component-compare.tsx`; new `api-diff-view` component |
| E. Lane compare port          | 14–15 | new `lane-compare.tsx` + page, drawer stripped                                                                                    |
| F. Wiring + verification      | 16    | `lanes.ui.runtime.tsx` rebuilt tabs, gates green                                                                                  |

---

## Phase A — Primitives (in `components/ui/component-compare/component-compare/`)

The existing `component-compare` bit component (`teambit.component/ui/component-compare/component-compare`, rootDir `components/ui/component-compare/component-compare`) is the home for `diff-mode-context`, `file-registry`, `compare-toolbar`, `compare-sidebar`, and the later `InlineComponentCompare`. These ship inside the existing component — no new `.bitmap` entries — and are re-exported from its `index.ts`.

### Task 1: Port `diff-mode-context`

**Files:**

- Create: `components/ui/component-compare/component-compare/diff-mode-context.tsx`
- Modify: `components/ui/component-compare/component-compare/index.ts`

- [ ] **Step 1: Copy file verbatim**

```bash
cp /Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/diff-mode-context.tsx \
   components/ui/component-compare/component-compare/diff-mode-context.tsx
```

- [ ] **Step 2: Add exports to index.ts**

Read `components/ui/component-compare/component-compare/index.ts` (current 2 lines export `ComponentCompare` and types). Append:

```ts
export { DiffModeProvider, useDiffMode } from './diff-mode-context';
export type { DiffDisplayMode } from './diff-mode-context';
```

- [ ] **Step 3: Compile**

```bash
bit compile teambit.component/ui/component-compare/component-compare
```

Expected: succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/component-compare/component-compare/diff-mode-context.tsx \
        components/ui/component-compare/component-compare/index.ts
git commit -m "feat(component-compare): add DiffModeProvider/useDiffMode primitive"
```

### Task 2: Port `file-registry`

**Files:**

- Create: `components/ui/component-compare/component-compare/file-registry.tsx`
- Modify: `components/ui/component-compare/component-compare/index.ts`

- [ ] **Step 1: Copy file verbatim**

```bash
cp /Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/file-registry.tsx \
   components/ui/component-compare/component-compare/file-registry.tsx
```

- [ ] **Step 2: Add exports to index.ts**

Append:

```ts
export {
  FileRegistryProvider,
  useFileRegistry,
  useFileRegistryRegister,
  useAspectRegistryRegister,
  useCompositionsRegistryRegister,
} from './file-registry';
export type { FileInfo } from './file-registry';
```

- [ ] **Step 3: Compile**

```bash
bit compile teambit.component/ui/component-compare/component-compare
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/component-compare/component-compare/file-registry.tsx \
        components/ui/component-compare/component-compare/index.ts
git commit -m "feat(component-compare): add FileRegistry context primitive"
```

### Task 3: Port `compare-toolbar`

**Files:**

- Create: `components/ui/component-compare/component-compare/compare-toolbar.tsx`
- Create: `components/ui/component-compare/component-compare/compare-toolbar.module.scss`
- Modify: `components/ui/component-compare/component-compare/index.ts`

- [ ] **Step 1: Copy files verbatim**

```bash
cp /Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/compare-toolbar.tsx \
   components/ui/component-compare/component-compare/compare-toolbar.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/compare-toolbar.module.scss \
   components/ui/component-compare/component-compare/compare-toolbar.module.scss
```

- [ ] **Step 2: Verify imports resolve**

The file imports `@teambit/design.inputs.toggle-button`, `@teambit/design.elements.icon`, `@teambit/design.ui.tooltip`, `@teambit/design.inputs.selectors.multi-select`. Verify each is available:

```bash
for p in @teambit/design.inputs.toggle-button @teambit/design.elements.icon @teambit/design.ui.tooltip @teambit/design.inputs.selectors.multi-select; do
  ls "node_modules/$p" >/dev/null 2>&1 && echo "OK $p" || echo "MISSING $p"
done
```

Expected: all four `OK`. If any are `MISSING`, run `bit install` and retry. If still missing, add them to `workspace.jsonc` `dependencies` block (use the version found in `/Users/luv/bit.dev/code/ws/new-changes/node_modules/<pkg>/package.json`) and `bit install` again.

- [ ] **Step 3: Add exports to index.ts**

Append:

```ts
export { CompareToolbar } from './compare-toolbar';
export type { CompareToolbarProps, CompareViewMode, CompareGroupByOption, DiffMode } from './compare-toolbar';
```

- [ ] **Step 4: Compile**

```bash
bit compile teambit.component/ui/component-compare/component-compare
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/component-compare/component-compare/compare-toolbar.tsx \
        components/ui/component-compare/component-compare/compare-toolbar.module.scss \
        components/ui/component-compare/component-compare/index.ts \
        workspace.jsonc 2>/dev/null
git commit -m "feat(component-compare): add CompareToolbar primitive"
```

### Task 4: Port `compare-sidebar`

**Files:**

- Create: `components/ui/component-compare/component-compare/compare-sidebar.tsx`
- Create: `components/ui/component-compare/component-compare/compare-sidebar.module.scss`
- Modify: `components/ui/component-compare/component-compare/index.ts`

- [ ] **Step 1: Copy files verbatim**

```bash
cp /Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/compare-sidebar.tsx \
   components/ui/component-compare/component-compare/compare-sidebar.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/compare-sidebar.module.scss \
   components/ui/component-compare/component-compare/compare-sidebar.module.scss
```

- [ ] **Step 2: Add exports to index.ts**

Append:

```ts
export { CompareSidebar } from './compare-sidebar';
export type { CompareSidebarProps, CompareSidebarItem, CompareSidebarGroup } from './compare-sidebar';
```

- [ ] **Step 3: Compile**

```bash
bit compile teambit.component/ui/component-compare/component-compare
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/component-compare/component-compare/compare-sidebar.tsx \
        components/ui/component-compare/component-compare/compare-sidebar.module.scss \
        components/ui/component-compare/component-compare/index.ts
git commit -m "feat(component-compare): add CompareSidebar primitive"
```

---

## Phase B — Non-monaco diff foundation

### Task 5: Create `inline-diff-viewer` component

**Component identity:** scope `teambit.code`, name `ui/inline-diff-viewer`, package id `@teambit/code.ui.inline-diff-viewer`, rootDir `components/ui/inline-diff-viewer`.

**Files:**

- Create: `components/ui/inline-diff-viewer/inline-diff-viewer.tsx`
- Create: `components/ui/inline-diff-viewer/inline-diff-viewer.module.scss`
- Create: `components/ui/inline-diff-viewer/index.ts`
- Modify: `.bitmap`

The source uses only the `diff` npm package — no monaco.

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/inline-diff-viewer
cp /Users/luv/bit.dev/code/ws/new-changes/code/ui/inline-diff-viewer/inline-diff-viewer.tsx \
   components/ui/inline-diff-viewer/inline-diff-viewer.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/code/ui/inline-diff-viewer/inline-diff-viewer.module.scss \
   components/ui/inline-diff-viewer/inline-diff-viewer.module.scss
cp /Users/luv/bit.dev/code/ws/new-changes/code/ui/inline-diff-viewer/index.ts \
   components/ui/inline-diff-viewer/index.ts
```

- [ ] **Step 2: Verify `diff` npm package is available**

```bash
ls node_modules/diff/package.json >/dev/null 2>&1 && echo OK || echo MISSING
```

If missing, add the version from `/Users/luv/bit.dev/code/ws/new-changes/node_modules/diff/package.json` (`cat .../node_modules/diff/package.json | grep '"version"'`) to `workspace.jsonc` under `"dependencies"` → `"diff": "<version>"`, then `bit install`.

- [ ] **Step 3: Register in `.bitmap`**

Insert this entry (alphabetical position — find a sensible slot near other `"ui/..."` entries with `grep -n '"ui/' .bitmap | head`):

```jsonc
"ui/inline-diff-viewer": {
    "name": "ui/inline-diff-viewer",
    "scope": "teambit.code",
    "mainFile": "index.ts",
    "rootDir": "components/ui/inline-diff-viewer",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 4: Verify bit recognises the component**

```bash
bit status 2>&1 | grep -i "inline-diff-viewer"
```

Expected: the component name is listed (likely as "new component").

- [ ] **Step 5: Compile**

```bash
bit compile teambit.code/ui/inline-diff-viewer
```

Expected: succeeds. The component's package id is `@teambit/code.ui.inline-diff-viewer`.

- [ ] **Step 6: Commit**

```bash
git add components/ui/inline-diff-viewer .bitmap workspace.jsonc 2>/dev/null
git commit -m "feat(code): add inline-diff-viewer (non-monaco diff renderer)"
```

### Task 6: Create `deps-diff-table` component

**Component identity:** scope `teambit.dependencies`, name `ui/deps-diff-table`, package id `@teambit/dependencies.ui.deps-diff-table`, rootDir `components/ui/deps-diff-table`.

**Files:**

- Create: `components/ui/deps-diff-table/deps-diff-table.tsx`
- Create: `components/ui/deps-diff-table/deps-diff-table.module.scss`
- Create: `components/ui/deps-diff-table/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/deps-diff-table
cp /Users/luv/bit.dev/code/ws/new-changes/dependencies/ui/deps-diff-table/deps-diff-table.tsx \
   components/ui/deps-diff-table/deps-diff-table.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/dependencies/ui/deps-diff-table/deps-diff-table.module.scss \
   components/ui/deps-diff-table/deps-diff-table.module.scss
cp /Users/luv/bit.dev/code/ws/new-changes/dependencies/ui/deps-diff-table/index.ts \
   components/ui/deps-diff-table/index.ts
```

- [ ] **Step 2: Verify external imports**

The file imports `@teambit/component.ui.component-compare.status-resolver` and `@teambit/ui-foundation.ui.menu-widget-icon`. Verify:

```bash
for p in @teambit/component.ui.component-compare.status-resolver @teambit/ui-foundation.ui.menu-widget-icon; do
  ls "node_modules/$p" >/dev/null 2>&1 && echo "OK $p" || echo "MISSING $p"
done
```

If missing, `bit install` then retry. If still missing, add to `workspace.jsonc` dependencies.

- [ ] **Step 3: Register in `.bitmap`**

```jsonc
"ui/deps-diff-table": {
    "name": "ui/deps-diff-table",
    "scope": "teambit.dependencies",
    "mainFile": "index.ts",
    "rootDir": "components/ui/deps-diff-table",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 4: Compile**

```bash
bit compile teambit.dependencies/ui/deps-diff-table
```

Package id: `@teambit/dependencies.ui.deps-diff-table`.

- [ ] **Step 5: Commit**

```bash
git add components/ui/deps-diff-table .bitmap workspace.jsonc 2>/dev/null
git commit -m "feat(dependencies): add deps-diff-table component"
```

---

## Phase C — Inline tab components

Each inline-\* component is a small file (≤200 lines), depends on primitives ported in Phases A/B, and is registered into the lane-compare `tabs` array in Task 16.

### Task 7: Create `inline-code-compare` component

**Component identity:** scope `teambit.code`, name `ui/inline-code-compare`, package id `@teambit/code.ui.inline-code-compare`, rootDir `components/ui/inline-code-compare`.

**Files:**

- Create: `components/ui/inline-code-compare/inline-code-compare.tsx`
- Create: `components/ui/inline-code-compare/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/inline-code-compare
cp /Users/luv/bit.dev/code/ws/new-changes/code/ui/inline-code-compare/inline-code-compare.tsx \
   components/ui/inline-code-compare/inline-code-compare.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/code/ui/inline-code-compare/index.ts \
   components/ui/inline-code-compare/index.ts
```

- [ ] **Step 2: Confirm imports resolve**

The file imports `@teambit/component.ui.component-compare.context`, `@teambit/component.ui.component-compare`, `@teambit/code.ui.queries.get-file-content`, `@teambit/code.ui.inline-diff-viewer`. The first two exist in `____bit`; the third is a registry pkg; the fourth is the component you created in Task 5.

```bash
for p in @teambit/component.ui.component-compare.context @teambit/component.ui.component-compare @teambit/code.ui.queries.get-file-content @teambit/code.ui.inline-diff-viewer; do
  ls "node_modules/$p" >/dev/null 2>&1 && echo "OK $p" || echo "MISSING $p"
done
```

- [ ] **Step 3: Register in `.bitmap`**

```jsonc
"ui/inline-code-compare": {
    "name": "ui/inline-code-compare",
    "scope": "teambit.code",
    "mainFile": "index.ts",
    "rootDir": "components/ui/inline-code-compare",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 4: Compile**

```bash
bit install && bit compile teambit.code/ui/inline-code-compare
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/inline-code-compare .bitmap
git commit -m "feat(code): add inline-code-compare tab component"
```

### Task 8: Create `inline-tests-compare` component

**Component identity:** scope `teambit.review`, name `ui/inline-tests-compare`, package id `@teambit/review.ui.inline-tests-compare`, rootDir `components/ui/inline-tests-compare`.

**Files:**

- Create: `components/ui/inline-tests-compare/inline-tests-compare.tsx`
- Create: `components/ui/inline-tests-compare/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/inline-tests-compare
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-tests-compare/inline-tests-compare.tsx \
   components/ui/inline-tests-compare/inline-tests-compare.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-tests-compare/index.ts \
   components/ui/inline-tests-compare/index.ts
```

- [ ] **Step 2: Register in `.bitmap`**

```jsonc
"ui/inline-tests-compare": {
    "name": "ui/inline-tests-compare",
    "scope": "teambit.review",
    "mainFile": "index.ts",
    "rootDir": "components/ui/inline-tests-compare",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 3: Compile**

```bash
bit install && bit compile teambit.review/ui/inline-tests-compare
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/inline-tests-compare .bitmap
git commit -m "feat(review): add inline-tests-compare tab component"
```

### Task 9: Create `inline-config-compare` component

**Component identity:** scope `teambit.review`, name `ui/inline-config-compare`, package id `@teambit/review.ui.inline-config-compare`, rootDir `components/ui/inline-config-compare`.

**Files:**

- Create: `components/ui/inline-config-compare/inline-config-compare.tsx`
- Create: `components/ui/inline-config-compare/inline-config-compare.module.scss`
- Create: `components/ui/inline-config-compare/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/inline-config-compare
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-config-compare/inline-config-compare.tsx \
   components/ui/inline-config-compare/inline-config-compare.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-config-compare/inline-config-compare.module.scss \
   components/ui/inline-config-compare/inline-config-compare.module.scss
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-config-compare/index.ts \
   components/ui/inline-config-compare/index.ts
```

- [ ] **Step 2: Register in `.bitmap`**

```jsonc
"ui/inline-config-compare": {
    "name": "ui/inline-config-compare",
    "scope": "teambit.review",
    "mainFile": "index.ts",
    "rootDir": "components/ui/inline-config-compare",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 3: Compile**

```bash
bit install && bit compile teambit.review/ui/inline-config-compare
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/inline-config-compare .bitmap
git commit -m "feat(review): add inline-config-compare tab component"
```

### Task 10: Create `inline-preview-compare` component

**Component identity:** scope `teambit.preview`, name `ui/inline-preview-compare`, package id `@teambit/preview.ui.inline-preview-compare`, rootDir `components/ui/inline-preview-compare`.

**Files:**

- Create: `components/ui/inline-preview-compare/inline-preview-compare.tsx`
- Create: `components/ui/inline-preview-compare/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/inline-preview-compare
cp /Users/luv/bit.dev/code/ws/new-changes/preview/ui/inline-preview-compare/inline-preview-compare.tsx \
   components/ui/inline-preview-compare/inline-preview-compare.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/preview/ui/inline-preview-compare/index.ts \
   components/ui/inline-preview-compare/index.ts
```

- [ ] **Step 2: Verify deps**

The file imports `@teambit/preview.ui.preview-compare` and `@teambit/compositions.ui.composition-compare`. Verify:

```bash
for p in @teambit/preview.ui.preview-compare @teambit/compositions.ui.composition-compare; do
  ls "node_modules/$p" >/dev/null 2>&1 && echo "OK $p" || echo "MISSING $p"
done
```

If missing, `bit install`, then add to `workspace.jsonc` dependencies if still absent (use versions from `ws/new-changes/node_modules`).

- [ ] **Step 3: Register in `.bitmap`**

```jsonc
"ui/inline-preview-compare": {
    "name": "ui/inline-preview-compare",
    "scope": "teambit.preview",
    "mainFile": "index.ts",
    "rootDir": "components/ui/inline-preview-compare",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 4: Compile**

```bash
bit install && bit compile teambit.preview/ui/inline-preview-compare
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/inline-preview-compare .bitmap workspace.jsonc 2>/dev/null
git commit -m "feat(preview): add inline-preview-compare tab component"
```

### Task 11: Create `inline-deps-compare` component

**Component identity:** scope `teambit.review`, name `ui/inline-deps-compare`, package id `@teambit/review.ui.inline-deps-compare`, rootDir `components/ui/inline-deps-compare`.

**Files:**

- Create: `components/ui/inline-deps-compare/inline-deps-compare.tsx`
- Create: `components/ui/inline-deps-compare/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/inline-deps-compare
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-deps-compare/inline-deps-compare.tsx \
   components/ui/inline-deps-compare/inline-deps-compare.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/review/ui/inline-deps-compare/index.ts \
   components/ui/inline-deps-compare/index.ts
```

- [ ] **Step 2: Register in `.bitmap`**

```jsonc
"ui/inline-deps-compare": {
    "name": "ui/inline-deps-compare",
    "scope": "teambit.review",
    "mainFile": "index.ts",
    "rootDir": "components/ui/inline-deps-compare",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 3: Compile**

```bash
bit install && bit compile teambit.review/ui/inline-deps-compare
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/inline-deps-compare .bitmap
git commit -m "feat(review): add inline-deps-compare tab component"
```

---

## Phase D — Compare shell additions

### Task 12: Inject `InlineComponentCompare` and `ComponentCompareHeader` into existing `component-compare.tsx`

The new-changes `component-compare.tsx` contains both the existing-shape `ComponentCompare` AND new exports `InlineComponentCompare`, `ComponentCompareHeader`, plus helper components (`InlineContextProvider`, `EagerFileRegistrar`, `EagerAspectRegistrar`, `DeferredTab`, `Skeleton`). The existing `____bit` file has only `ComponentCompare`. We need to **append** the new exports as additive code without disturbing existing `ComponentCompare`.

**Files:**

- Modify: `components/ui/component-compare/component-compare/component-compare.tsx`
- Modify: `components/ui/component-compare/component-compare/component-compare.module.scss`
- Modify: `components/ui/component-compare/component-compare/index.ts`

- [ ] **Step 1: Inspect the existing module.scss for class-name collisions**

```bash
grep -E "^\.(componentCompare|header|headerLeft|headerRight|componentName|envIcon|envIconPlaceholder|changeTags|changeTag|versions|versionHash|versionArrow|skeleton|skeletonBar)" \
  components/ui/component-compare/component-compare/component-compare.module.scss
```

For every match found, the new code's classes need a prefix to avoid colliding with existing styles. Use the prefix `inline` (e.g., `inlineHeader`, `inlineComponentName`).

- [ ] **Step 2: Extract the new exports from new-changes source**

Open `/Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/component-compare.tsx`. Lines 1–139 hold the `InlineComponentCompare` definition; lines 141–434 hold `DeferredTab`, `InlineContextProvider`, `EagerFileRegistrar`, `EagerAspectRegistrar`, `ComponentCompareHeader`, `Skeleton`. The remainder (lines 436 onward) is the alternative-form `ComponentCompare` definition that differs from `____bit`'s existing one — **do not port it**; `____bit` keeps its existing `ComponentCompare`.

Copy lines 1–35 imports + the symbols above into a new section appended to `____bit`'s `component-compare.tsx`. Specifically, add the following symbols at the **end** of `____bit`'s `component-compare.tsx`, after the existing `ComponentCompare` export:

```ts
// ─── new-design additions (lane-compare port) ──────────────────────────────
// 1) Top of file: ensure these imports exist (merge with existing imports, do not duplicate):
//    - import { head } from 'lodash';                                       // if not already imported
//    - import { useGetComponents } from '@teambit/components.hooks.use-list-components';
//    - import { createComponentModel, getCompositions } from '@teambit/components.legacy.create-component-model';
//    - import { useCode } from '@teambit/code.ui.queries.get-component-code';
//    - import { ComponentID as ComponentIdValue } from '@teambit/component-id';
//    - import { useFileRegistryRegister, useAspectRegistryRegister, useCompositionsRegistryRegister } from './file-registry';
//
// 2) Append symbols `InlineComponentCompare`, `DeferredTab`, `InlineContextProvider`,
//    `EagerFileRegistrar`, `EagerAspectRegistrar`, `ComponentCompareHeader`, and a local
//    `Skeleton` helper. Rename any local helper that collides with an existing one
//    (e.g., if `____bit` already has a `Skeleton` function in this file, name the new
//    one `InlineSkeleton`).
//
// 3) Replace any class-name reference identified in Step 1 with its `inline`-prefixed form.
```

This task is unavoidably manual because the merge requires reconciling imports and helper names. The agent should:

a. Read `____bit`'s current `component-compare.tsx` to find existing imports and helpers.
b. Read `ws/new-changes/component/ui/component-compare/component-compare.tsx` lines 1–434.
c. Add only the new imports the appended block actually uses (de-duplicating against existing).
d. Append the function definitions verbatim, renaming any collisions.
e. If `@teambit/components.hooks.use-list-components` or `@teambit/components.legacy.create-component-model` cannot be resolved (see Step 4), implement the **fallback** described in Step 6.

- [ ] **Step 3: Append new SCSS classes**

Append to `components/ui/component-compare/component-compare/component-compare.module.scss` all classes used by the new code (prefixed per Step 1 if needed):

`.componentCompare`, `.header`, `.headerLeft`, `.headerRight`, `.componentName`, `.envIcon`, `.envIconPlaceholder`, `.changeTags`, `.changeTag`, `.versions`, `.versionHash`, `.versionArrow`, `.skeleton`, `.skeletonBar`.

Source SCSS is the corresponding block in `/Users/luv/bit.dev/code/ws/new-changes/component/ui/component-compare/component-compare.module.scss`. Copy only the rules for those classes, prefixed if needed.

- [ ] **Step 4: Verify the optional deps**

```bash
for p in @teambit/components.hooks.use-list-components @teambit/components.legacy.create-component-model @teambit/code.ui.queries.get-component-code; do
  ls "node_modules/$p" >/dev/null 2>&1 && echo "OK $p" || echo "MISSING $p"
done
```

- [ ] **Step 5: Add exports to index.ts**

```ts
export { InlineComponentCompare, ComponentCompareHeader } from './component-compare';
export type { InlineComponentCompareProps, ComponentCompareHeaderProps } from './component-compare';
```

- [ ] **Step 6: Fallback if `@teambit/components.*` packages are MISSING**

If Step 4 reported any package as MISSING and `bit install` does not resolve it, refactor `InlineContextProvider` and `EagerFileRegistrar` to use the existing pattern already in `____bit`'s `ComponentCompare`:

- Replace `useGetComponents([id], skip)` + `head(components)` with `useComponent('teambit.scope/scope', id, { skip })` (already imported at top of file).
- Replace `createComponentModel(descriptor, undefined, previewUrl)` with the `component` returned from `useComponent` (which is already a ComponentModel).
- Replace `getCompositions(descriptor)` with `component?.compositions ?? []`.
- Replace `useCode(componentId)` with the existing pattern used by `____bit`'s `ComponentCompare` to extract file lists from `componentCompareData.code` (already in scope via `useComponentCompareQuery`).

After refactor, the public surface (`InlineComponentCompare`, `ComponentCompareHeader`, `InlineComponentCompareProps`, `ComponentCompareHeaderProps`) must stay the same — the consumer in lane-compare doesn't see internals.

- [ ] **Step 7: Compile**

```bash
bit compile teambit.component/ui/component-compare/component-compare
```

If errors, address them in this task before committing.

- [ ] **Step 8: Commit**

```bash
git add components/ui/component-compare/component-compare/component-compare.tsx \
        components/ui/component-compare/component-compare/component-compare.module.scss \
        components/ui/component-compare/component-compare/index.ts
git commit -m "feat(component-compare): add InlineComponentCompare + ComponentCompareHeader"
```

### Task 13: Create `api-diff-view` component

**Component identity:** scope `teambit.semantics`, name `ui/api-diff-view`, package id `@teambit/semantics.ui.api-diff-view`, rootDir `components/ui/api-diff-view`.

**Files:**

- Create: `components/ui/api-diff-view/api-diff-view.tsx`
- Create: `components/ui/api-diff-view/api-diff-view.module.scss`
- Create: `components/ui/api-diff-view/index.ts`
- Modify: `.bitmap`

- [ ] **Step 1: Make the directory and copy files**

```bash
mkdir -p components/ui/api-diff-view
cp /Users/luv/bit.dev/code/ws/new-changes/semantics/ui/api-diff-view/api-diff-view.tsx \
   components/ui/api-diff-view/api-diff-view.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/semantics/ui/api-diff-view/api-diff-view.module.scss \
   components/ui/api-diff-view/api-diff-view.module.scss
cp /Users/luv/bit.dev/code/ws/new-changes/semantics/ui/api-diff-view/index.ts \
   components/ui/api-diff-view/index.ts
```

- [ ] **Step 2: Register in `.bitmap`**

```jsonc
"ui/api-diff-view": {
    "name": "ui/api-diff-view",
    "scope": "teambit.semantics",
    "mainFile": "index.ts",
    "rootDir": "components/ui/api-diff-view",
    "onLanesOnly": false,
    "isAvailableOnCurrentLane": true,
    "config": {}
},
```

- [ ] **Step 3: Compile**

```bash
bit install && bit compile teambit.semantics/ui/api-diff-view
```

- [ ] **Step 4: Lint touched files so far**

```bash
npm run lint 2>&1 | tail -30
```

Fix any errors in files we've added. If lint complains about types in copied code, prefer to fix in the copied file rather than disabling rules — the original came from a different repo with different rules.

- [ ] **Step 5: Commit**

```bash
git add components/ui/api-diff-view .bitmap
git commit -m "feat(api-diff-view): add full-pane API diff component"
```

---

## Phase E — Lane compare port

### Task 14: Replace `lane-compare` with the new design (drawer stripped)

**Files:**

- Replace: `components/ui/compare/lane-compare/lane-compare.tsx`
- Replace: `components/ui/compare/lane-compare/lane-compare.module.scss`
- Replace: `components/ui/compare/lane-compare/lane-compare.provider.tsx`
- Replace: `components/ui/compare/lane-compare/lane-compare.models.ts`
- Replace: `components/ui/compare/lane-compare/lane-compare.context.ts`
- Replace: `components/ui/compare/lane-compare/lane-compare.utils.ts`
- Replace: `components/ui/compare/lane-compare/index.ts`

- [ ] **Step 1: Copy all source files verbatim**

```bash
SRC=/Users/luv/bit.dev/code/ws/new-changes/lanes/ui/compare/lane-compare
DST=components/ui/compare/lane-compare
cp "$SRC/lane-compare.tsx"          "$DST/lane-compare.tsx"
cp "$SRC/lane-compare.module.scss"  "$DST/lane-compare.module.scss"
cp "$SRC/lane-compare.provider.tsx" "$DST/lane-compare.provider.tsx"
cp "$SRC/lane-compare.models.ts"    "$DST/lane-compare.models.ts"
cp "$SRC/lane-compare.context.ts"   "$DST/lane-compare.context.ts"
cp "$SRC/lane-compare.utils.ts"     "$DST/lane-compare.utils.ts"
cp "$SRC/index.ts"                  "$DST/index.ts"
```

Note: we do **not** copy `$SRC/lane-diff-types.ts`. Make sure that file is **not** present in `$DST`:

```bash
rm -f components/ui/compare/lane-compare/lane-diff-types.ts
```

- [ ] **Step 2: Rewire `ChangeType` / `LaneComponentDiff` imports**

In every file under `components/ui/compare/lane-compare/`, replace any import that comes from `./lane-diff-types` with one from `@teambit/lanes.entities.lane-diff`:

```bash
cd components/ui/compare/lane-compare
sed -i.bak -E "s|from ['\"]\\./lane-diff-types['\"]|from '@teambit/lanes.entities.lane-diff'|g" \
  lane-compare.tsx lane-compare.provider.tsx lane-compare.models.ts lane-compare.context.ts lane-compare.utils.ts index.ts
rm -f *.bak
cd - >/dev/null
```

- [ ] **Step 3: Rewire `useLaneComponents` import path**

In `lane-compare.tsx` (and any other file that imports it), replace `@teambit/dot-lanes.hooks.use-lane-components` with `@teambit/lanes.hooks.use-lane-components`:

```bash
cd components/ui/compare/lane-compare
sed -i.bak -E "s|@teambit/dot-lanes\\.hooks\\.use-lane-components|@teambit/lanes.hooks.use-lane-components|g" \
  lane-compare.tsx lane-compare.provider.tsx lane-compare.models.ts lane-compare.context.ts lane-compare.utils.ts index.ts
rm -f *.bak
cd - >/dev/null
```

- [ ] **Step 4: Update `index.ts` exports**

Open `components/ui/compare/lane-compare/index.ts` and replace its full contents with:

```ts
export { LaneCompare } from './lane-compare';
export type { LaneCompareProps } from './lane-compare';
export type { LaneCompareContextModel } from './lane-compare.context';
export { LaneCompareContext, useLaneCompareContext } from './lane-compare.context';
export type { LaneCompareProviderProps, LaneCompareGroupBy } from './lane-compare.provider';
export { LaneCompareProvider } from './lane-compare.provider';
export { ChangeTypeGroupOrder } from './lane-compare.models';
export type { LaneFilter } from './lane-compare.models';
export { displayChangeType, extractCompsToDiff, filterDepKey as laneFilterDepKey } from './lane-compare.utils';
```

(Removes `DrawerWidgetProps` export and `lane-diff-types` re-exports.)

- [ ] **Step 5: Strip `DrawerWidgetProps` from `lane-compare.models.ts`**

Open `components/ui/compare/lane-compare/lane-compare.models.ts`. Delete the `DrawerWidgetProps` type definition (and any unused imports it leaves behind).

- [ ] **Step 6: Strip drawer state from `lane-compare.provider.tsx`**

Open `components/ui/compare/lane-compare/lane-compare.provider.tsx`. Remove:

- The props `defaultOpenDrawers`, `defaultFullScreen` from `LaneCompareProviderProps`.
- The state declarations: `const [openDrawerList, setOpenDrawerList] = useState(...)`, `const [fullScreenDrawerKey, setFullScreen] = useState(...)`.
- All `useEffect` blocks that update `openDrawerList`, `setOpenDrawerList`, `fullScreenDrawerKey`, or `setFullScreen`.
- Any reference to these in the value passed to `LaneCompareContext.Provider` (and to the matching field in `LaneCompareContextModel` in `lane-compare.context.ts`).

If `LaneCompareContextModel` in `lane-compare.context.ts` references `openDrawerList`/`fullScreenDrawerKey`, remove those fields too.

- [ ] **Step 7: Strip drawer props from `LaneCompareProps`**

Open `components/ui/compare/lane-compare/lane-compare.tsx`. In the `LaneCompareProps` type, delete:

- `Drawer?: any;`
- `DrawerWidgets?: any;`
- `onFullScreenChanged?: ...`
- `onDrawerToggled?: ...`
- `onDrawerVersionChanged?: ...`

In the destructuring at the top of `LaneCompareInline`, remove the corresponding entries (`Drawer: _Drawer`, etc.). The `_Drawer`, `_DrawerWidgets` etc. underscored references are unused — drop them.

- [ ] **Step 8: Verify drawer is gone**

```bash
grep -ri "Drawer\|drawer" components/ui/compare/lane-compare/
```

Expected: **zero matches**. If any match remains (other than legitimate comments — but there should be none), edit the file to remove it.

- [ ] **Step 9: Verify monaco is gone**

```bash
grep -ri "monaco\|code-editor\|code-compare-view\|code-compare-editor" components/ui/compare/lane-compare/
```

Expected: zero matches.

- [ ] **Step 10: Compile**

```bash
bit install && bit compile teambit.lanes/ui/compare/lane-compare
```

If compile errors are about missing types `ChangeType` / `LaneComponentDiff` exports from `@teambit/lanes.entities.lane-diff`, sanity-check:

```bash
cat scopes/lanes/entities/lane-diff/index.ts
```

The exports there should include `ChangeType` and `LaneComponentDiff`.

- [ ] **Step 11: Commit**

```bash
git add components/ui/compare/lane-compare
git commit -m "feat(lane-compare): port new design, strip drawer, rewire to workspace data"
```

### Task 15: Replace `lane-compare-page`

**Files:**

- Replace: `components/ui/compare/lane-compare-page/lane-compare-page.tsx`
- Replace: `components/ui/compare/lane-compare-page/lane-compare-page.module.scss`

- [ ] **Step 1: Copy files**

```bash
cp /Users/luv/bit.dev/code/ws/new-changes/lanes/ui/compare/lane-compare-page/lane-compare-page.tsx \
   components/ui/compare/lane-compare-page/lane-compare-page.tsx
cp /Users/luv/bit.dev/code/ws/new-changes/lanes/ui/compare/lane-compare-page/lane-compare-page.module.scss \
   components/ui/compare/lane-compare-page/lane-compare-page.module.scss
```

- [ ] **Step 2: Verify imports**

`lane-compare-page.tsx` imports `@teambit/lanes` (for `LaneCompareProps`, `LanesModel`), `@teambit/lanes.hooks.use-lanes`, `@teambit/lanes.ui.inputs.lane-selector`, `@teambit/lanes.ui.models.lanes-model`. All exist in `____bit`. Confirm:

```bash
for p in @teambit/lanes @teambit/lanes.hooks.use-lanes @teambit/lanes.ui.inputs.lane-selector @teambit/lanes.ui.models.lanes-model; do
  ls "node_modules/$p" >/dev/null 2>&1 && echo "OK $p" || echo "MISSING $p"
done
```

- [ ] **Step 3: Compile**

```bash
bit compile teambit.lanes/ui/compare/lane-compare-page
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/compare/lane-compare-page
git commit -m "feat(lane-compare-page): port new design"
```

---

## Phase F — Wiring and verification

### Task 16: Rebuild lane-compare tab list in `lanes.ui.runtime.tsx`; run acceptance gates

**Files:**

- Modify: `scopes/lanes/lanes/lanes.ui.runtime.tsx`

- [ ] **Step 1: Replace `getLaneCompare` body**

Open `scopes/lanes/lanes/lanes.ui.runtime.tsx`. Locate the `getLaneCompare = (props: LaneCompareProps) => { ... }` method (around line 344). Replace the **entire arrow function body** with:

```tsx
getLaneCompare = (props: LaneCompareProps) => {
  if (!props.base || !props.compare) return null;

  const tabs: TabItem[] = [
    { id: 'inline-code', order: 1, displayName: 'Code', element: React.createElement(InlineCodeCompare) },
    { id: 'inline-preview', order: 2, displayName: 'Preview', element: React.createElement(InlinePreviewCompare) },
    { id: 'inline-deps', order: 4, displayName: 'Dependencies', element: React.createElement(InlineDepsCompare) },
    { id: 'inline-tests', order: 5, displayName: 'Tests', element: React.createElement(InlineTestsCompare) },
    { id: 'inline-config', order: 6, displayName: 'Configuration', element: React.createElement(InlineConfigCompare) },
  ];

  return (
    <LaneCompare
      {...props}
      base={props.base}
      compare={props.compare}
      host={props.host || this.host}
      tabs={props.tabs || tabs}
    />
  );
};
```

Note: the docs tab (`InlineDocsCompare` / `OverviewCompare`) is intentionally omitted — the new design references `@teambit/docs.ui.overview-compare` which is not ported in this plan. The view-mode auto-switch in `LaneCompare` will skip `docs` if its tab is absent.

- [ ] **Step 2: Add imports at the top of the file**

Open `scopes/lanes/lanes/lanes.ui.runtime.tsx` and add (in the import block, alphabetically grouped):

```tsx
import { InlineCodeCompare } from '@teambit/code.ui.inline-code-compare';
import { InlinePreviewCompare } from '@teambit/preview.ui.inline-preview-compare';
import { InlineDepsCompare } from '@teambit/review.ui.inline-deps-compare';
import { InlineTestsCompare } from '@teambit/review.ui.inline-tests-compare';
import { InlineConfigCompare } from '@teambit/review.ui.inline-config-compare';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
```

If `TabItem` is already imported, skip that line.

- [ ] **Step 3: Verify `componentCompareUI.tabs` is no longer referenced in `getLaneCompare`**

```bash
sed -n '/getLaneCompare = /,/^  [a-zA-Z]/p' scopes/lanes/lanes/lanes.ui.runtime.tsx | grep -i 'componentCompareUI\.tabs'
```

Expected: zero output.

- [ ] **Step 4: Compile the lanes aspect**

```bash
bit compile teambit.lanes/lanes
```

- [ ] **Step 5: Run acceptance gates from the spec**

```bash
echo "=== Gate 1: no drawer in lane-compare ===" && \
grep -ri "Drawer\|drawer" components/ui/compare/lane-compare/ && echo "FAIL" || echo "PASS"

echo "=== Gate 1b: no lane-compare-drawer import ===" && \
grep -ri "lane-compare-drawer" components/ components/ui/component-compare/ scopes/lanes/lanes/ && echo "FAIL" || echo "PASS"

echo "=== Gate 2: no monaco in lane-compare chain ===" && \
grep -ri "monaco" \
  components/ui/compare/lane-compare/ \
  components/ui/component-compare/component-compare/compare-toolbar.tsx \
  components/ui/component-compare/component-compare/compare-sidebar.tsx \
  components/ui/component-compare/component-compare/file-registry.tsx \
  components/ui/component-compare/component-compare/diff-mode-context.tsx \
  components/ui/inline-diff-viewer/ \
  components/ui/inline-code-compare/ \
  components/ui/inline-preview-compare/ \
  components/ui/inline-deps-compare/ \
  components/ui/inline-tests-compare/ \
  components/ui/inline-config-compare/ \
  components/ui/deps-diff-table/ && echo "FAIL" || echo "PASS"

echo "=== Gate 2b: no code-editor/code-compare-view import in lane-compare ===" && \
grep -rE "code-editor|code-compare-view|code-compare-editor" components/ui/compare/lane-compare/ && echo "FAIL" || echo "PASS"

echo "=== Gate 3: tab wiring uses Inline*Compare ===" && \
grep -n 'InlineCodeCompare\|InlineDepsCompare\|InlineTestsCompare\|InlineConfigCompare\|InlinePreviewCompare' scopes/lanes/lanes/lanes.ui.runtime.tsx
```

Expected:

- Gate 1, 1b, 2, 2b: each prints `PASS` after any preceding grep output. (`grep` exits non-zero with no matches → echo PASS.)
- Gate 3: prints five lines, one per inline component import or usage.

If any gate fails, return to the relevant task to fix.

- [ ] **Step 6: Run lint**

```bash
npm run lint 2>&1 | tail -40
```

Fix any errors introduced by the port. Do not skip — lint must pass cleanly.

- [ ] **Step 7: Full compile**

```bash
bit compile
```

Expected: succeeds. If any compile error, fix in place.

- [ ] **Step 8: Manual smoke test**

```bash
bit start
```

Open the URL printed (typically `http://localhost:3000`), navigate to a workspace with at least two lanes that have diffs, and open the lane-compare page.

Verify visually:

- New layout: toolbar at top, sidebar at left, diff pane at right.
- View-mode toggle: Code / Preview / Dependencies / Tests / Configuration / API (counts shown).
- Group-by toggle: Scope / Namespace / None.
- Search-component multi-select narrows the list.
- Clicking a sidebar component scrolls/expands the diff card.
- Code diff renders **without any Monaco editor** in the DOM. Open browser DevTools → Elements; search for `monaco`. Expected: zero matches.
- Network tab → reload the page; filter for `monaco`. Expected: no monaco-editor chunks fetched.
- URL params (`?view=code&groupBy=scope`) round-trip on reload.

Kill the dev server with Ctrl+C.

- [ ] **Step 9: Commit and end**

```bash
git add scopes/lanes/lanes/lanes.ui.runtime.tsx
git commit -m "feat(lanes): wire lane-compare to non-monaco inline tab components"
```

---

## Done criteria

- All 16 tasks committed in order on the branch.
- §5 acceptance gates in the spec are met (steps in Task 16.5).
- `npm run lint` and `bit compile` both succeed at the end of Task 16.
- Manual smoke (Task 16.8) shows the new layout with zero Monaco usage.
