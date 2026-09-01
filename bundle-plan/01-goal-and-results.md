# 1. Goal & result so far

[← back to bundle-plan index](../bundle-plan.md)

Ship the Bit CLI as a **single bundled JavaScript file** plus a thin ring of packages that genuinely cannot be inlined, instead of a 1.2 GB `node_modules` tree.

|                     | released bit (bvm 2.0.72) | bundled bit (this branch)                                                                                    |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| install size        | **1.2 GB**                | **160 MB** (60 MB bundle + 64 MB externals + \~33 MB shims, incl. the 16.7 MB pre-bundled UI/preview — §17i) |
| files on disk       | **141,008**               | **\~2,839**                                                                                                  |
| `bit --help` (warm) | 0.662 s                   | 0.642 s (SEA: 1.324 s — §9)                                                                                  |
| `bit list` (warm)   | 0.914 s                   | **0.848 s** (SEA: 1.574 s)                                                                                   |
| single executable   | —                         | **179 MB** `bit-app` (+ the `bundle/` support dir)                                                           |
| build time          | n/a                       | \~11 s esbuild + \~5 s codegen (+ \~40 s for the SEA variant)                                                |

Every command on the target list — and a good deal more — runs from `/tmp/bit-bundle` against workspaces in `/tmp/bundle-tests/*`, with **zero** reads from this repo or from `~/.bvm` (§7.3).
