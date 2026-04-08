# CLI Output Style Guide

All CLI command output should use the shared formatting toolkit from `@teambit/cli` (`scopes/harmony/cli/output-formatter.ts`). Never use raw `chalk.underline` for headers or hardcode Unicode symbols directly.

## Toolkit Functions

| Function                            | Purpose                                                                                    | Example output                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatTitle(text)`                 | Bold white section title                                                                   | **modified components**                                                                                                                      |
| `formatSection(title, desc, items)` | Full section: title with count, dim description, item list. Returns `''` if items is empty | **modified components (3)**<br/>&nbsp;&nbsp;_(use "bit diff" to compare)_<br/><br/>&nbsp;&nbsp;&nbsp;› comp-a<br/>&nbsp;&nbsp;&nbsp;› comp-b |
| `formatItem(text, symbol?)`         | Indented item line (3-space + symbol + text). Defaults to `bulletSymbol`                   | &nbsp;&nbsp;&nbsp;› comp-a                                                                                                                   |
| `formatHint(text)`                  | Dim text for hints/timing                                                                  | _Finished. (1.2s)_                                                                                                                           |
| `formatSuccessSummary(msg)`         | Green checkmark + green text                                                               | ✔ 5/5 compiled successfully                                                                                                                 |
| `formatWarningSummary(msg)`         | Warning symbol + yellow text                                                               | ⚠ 2/5 failed                                                                                                                                |
| `joinSections(sections)`            | Filter empty strings, join with `\n\n`                                                     | —                                                                                                                                            |
| `renderSections(sections, expand?)` | Render with collapsible section support                                                    | —                                                                                                                                            |

## Symbols

| Symbol      | Variable          | Use for                                                                                     |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------- |
| ✔ (green)  | `successSymbol()` | Summary lines confirming an operation completed. **Not** for individual items in long lists |
| ⚠ (yellow) | `warnSymbol`      | Items with warnings, deprecations, pending state                                            |
| ✖ (red)    | `errorSymbol`     | Items with errors, failures, missing/deleted state                                          |
| › (dim)     | `bulletSymbol`    | Neutral list items — the default for informational lists                                    |

## Design Principles

### Silence means success

For commands that process many components (compile, import), don't list every successful item. Show only failures by default, with the full list available via `--verbose`. The summary line is enough when everything passes.

```
# default — all pass:
✔ 309/309 components compiled successfully.
Finished. (45s)

# default — some fail:
   ✖ teambit.workspace/watcher ... failed
   ✖ teambit.vue/vue-aspect ... failed

⚠ 2/309 components failed to compile.
Finished. (45s)
```

### Reserve checkmarks for summaries

Use `bulletSymbol` (›) for individual items in lists. Reserve `successSymbol` (✔) for summary lines that confirm an operation completed. A long list of checkmarks is visual noise.

### Section structure

Use `formatSection` when you have a title + optional description + list of items. For sections with non-standard structure (key-value summaries, error messages with suggestions), use `formatTitle` for the heading.

```typescript
// Standard section — use formatSection
formatSection('modified components', '(use "bit diff" to compare)', items);

// Non-standard section — use formatTitle directly
const title = formatTitle('Merge Summary');
const body = `\nTotal Merged: ${chalk.bold(count)}`;
return `${title}${body}`;
```

### Join sections with joinSections

Never use `compact([...]).join('\n\n')` from lodash. Use `joinSections([...])` which filters empty strings and joins with double newlines.

### Error sections

Prefix error section titles with `errorSymbol`:

```typescript
const title = `${errorSymbol} ${formatTitle('Installation Error')}`;
```

### Conflict/warning sections

Prefix conflict section titles with `warnSymbol`:

```typescript
const title = formatTitle(`${warnSymbol} files with conflicts summary`);
```

## Commands already using this toolkit

- `bit status` — `scopes/component/status/status-cmd.ts`, `status-formatter.ts`
- `bit tag` / `bit snap` / `bit export` — use toolkit symbols and formatters
- `bit compile` — `scopes/compilation/compiler/compiler.cmd.ts`, `output-formatter.ts`
- `bit import` — `scopes/scope/importer/import.cmd.ts`
- `bit merge` — `scopes/component/merging/merge-cmd.ts`
- Shared merge helpers — `scopes/component/modules/merge-helper/merge-output.ts` (also used by `checkout`, `switch`, `lane merge`)
- `bit add` — `scopes/component/tracker/add-cmd.ts`
- `bit deps` (set/remove/unset/reset/eject/blame/diagnose) — `scopes/dependencies/dependencies/dependencies-cmd.ts`
- `bit lint` — `scopes/defender/linter/lint.cmd.ts`
- `bit link` — `scopes/workspace/install/link/link.cmd.ts`
- `bit remove` / `bit delete` — `scopes/component/remove/remove-template.ts`, `delete-cmd.ts`
- `bit fork` — `scopes/component/forking/fork.cmd.ts`
- `bit recover` — `scopes/component/remove/recover-cmd.ts`
- `bit scope rename` / `bit scope rename-owner` — `scopes/component/renaming/scope-rename.cmd.ts`, `scope-rename-owner.cmd.ts`
- `bit remote` (add/del/list) — `scopes/harmony/global-config/remote-cmd.ts`
- `bit init` — `scopes/harmony/host-initializer/init-cmd.ts`, `host-initializer.main.runtime.ts`
- `bit clear-cache` — `scopes/workspace/clear-cache/clear-cache-cmd.ts`
- `bit eject-conf` — `scopes/workspace/workspace/eject-conf.cmd.ts`
- `bit scope set` — `scopes/workspace/workspace/scope-subcommands/scope-set.cmd.ts`
