You are converting ONE e2e test file in the Bit repo at /Users/davidfirst/teambit/bit2 into unit tests.

File: **FILE**

First read the playbook: /Users/davidfirst/teambit/bit2/.claude/skills/e2e-to-unit/SKILL.md. Follow it exactly. Also read /Users/davidfirst/teambit/bit2/CLAUDE.md. Good reference conversions already done: scopes/component/tracker/add-cmd.spec.ts, scopes/component/component/cat/cat.cmd.spec.ts, scopes/component/snapping/cat-versions.spec.ts.

Goal: convert every test in the file to unit tests (.spec.ts) in the aspect(s) that own the logic. Keep in the e2e file only tests that truly cannot run in-process (see the playbook). Then delete the e2e file with `git rm`, or trim it if some tests must stay.

Shared-workspace rules (other agents are converting other e2e files in this same working tree right now):

- NEVER modify, move or rename anything outside /Users/davidfirst/teambit/bit2 and the mock-workspace temp dirs your specs create. That includes ~/.bitrc.jsonc, global bit config and caches. If the developer's global config affects your test, make the spec immune to it (e.g. set the config on the loaded aspect) and mention it in the report.
- NEVER run git stash, git checkout, git reset, git commit, git restore, or anything that changes other files. `git rm <your e2e file>` is the only git write you may do.
- NEVER run bit2 install, bit2 import, bit2 checkout, bit2 lane \*, bit2 tag/snap in the repo itself (in-process tags inside mock workspaces in your specs are fine).
- Create NEW spec files (name them after what they test). Don't edit existing spec files, since another agent may be editing them. Don't touch production code. Don't edit scripts/e2e-test-timings.json.
- Run tests only by spec path: `bit2 test path/to/your.spec.ts`. If a run fails with odd ENOENT/lock errors unrelated to your code, wait ~30s and retry once.
- `npm run lint`: fix errors in YOUR files only; ignore errors in files other agents are editing.
- Avoid new dependency cycles: never import, in a spec of component C, an aspect that depends (transitively) on C. If unsure, use `bit2 deps get <aspect-id>` or check the aspect's main runtime `dependencies`, and prefer helpers the target already depends on.
- REQUIRED cycle check before reporting: `cd /Users/davidfirst/teambit/bit2 && BIT_BIN=bit2 node scripts/circular-deps-check/check-cycles.js`. CI runs the same check. It fails both when a component joins a cycle and when a spec adds a dependency between two components already in the same cycle (e.g. a snapping spec importing @teambit/tracker), so any finding that comes FROM the component your spec lives in must be fixed: move the test to a host that already depends on what it imports, or use helpers the component already depends on (e.g. `mockComponents`/`modifyMockedComponents` from @teambit/component.testing.mock-components). Never update cycles-baseline.json. Findings from other agents' components can be ignored.
- Keep e2e fixtures' intent but use the minimum setup. Keep every original assertion.

When done, reply with ONLY this short report (<200 words):

- e2e file: deleted | trimmed (N tests left)
- spec files created: paths, with test counts; original test count
- kept as e2e: each test + one-line reason (or "none")
- aspects/packages imported by the new specs (for the cycle check)
- verification: bit2 test result line, lint status for your files, bit2 status issues
- concerns: anything suspicious (an assertion you couldn't keep, a suspected bug found, etc.)
