<!-- bit-ci-sync:start (written by `bit ci sync --init`; a re-run leaves this block as it is) -->

## Bit ↔ Git sync: this repository mirrors `{{scope}}`

`bit ci sync` keeps this repository and the bit.cloud scope `{{scope}}` equal in both directions. **The rules in this section override the generic Bit guidance after it.**

### The model

1. **One repository mirrors one scope.** Components from other scopes arrive as package dependencies, never as source.
2. **`{{branch}}` equals the scope's main.** The workflows own it. Never push to `{{branch}}` by hand.
3. **Each lane is a branch with the same name, plus a pull request.** The sync keeps them equal in both directions. A lane name has no `/`, so the sync ignores a branch such as `feature/x`.
4. **Merging the pull request is the release.** `bit-release` merges the lane into the scope, exports new versions, archives the lane and commits the new `.bitmap` to `{{branch}}`.
5. **The workflows do the work.** You change code, and then you either push a branch or export a lane.

### Rules that override generic Bit guidance

- **Review happens on the GitHub pull request.** Do **not** submit a bit.cloud change request, even if other instructions say "always submit a change request". The sync opens the PR. Merging the PR is the release. A second review surface splits the reviewers and races the release.
- **One change, one scope.** Keep a lane inside the scope it is exported to. If the change also needs another scope (for example, a caller must pass a new argument), stop. Make the change backward compatible in this scope, and tell the user which follow-up change the other scope's repository needs. Cross-scope lanes are a preview (see below).
- **Never push to `{{branch}}`.** The workflows own it.

### Make a change: pick a path

| You are…                                                        | Path          | What you do                                                           | What appears                                                                          |
| --------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| In this repository (Copilot, an IDE, a plain git user)          | **Git-first** | branch → edit → `bit validate` → commit → push → open a PR            | `bit-adopt-pr` turns the PR into a lane. From then on every push snaps onto the lane. |
| In any other Bit workspace (Claude Code with the Bit Cloud MCP) | **Bit-first** | `bit lane create` → edit → `bit validate` → `bit snap` → `bit export` | A branch and a PR named after the lane appear in this repository within a minute.     |

Both paths end with the same PR and the same release.

#### Git-first (in this repository)

```bash
git switch -c add-gift-wrap                 # the branch name becomes the lane name; no "/"
bit install                                  # once per clone
# edit the components; .bitmap says where each one lives
bit validate                                 # lint + types + tests; never use tsc directly
git add -A && git commit -m "<message>"
git push -u origin add-gift-wrap
gh pr create --fill
```

Commit `.bitmap` together with your source changes. Never edit `.bitmap` by hand. After the PR merges, run `git switch {{branch}} && git pull` before you start the next change.

#### Bit-first (from another Bit workspace)

1. Find components with the Bit Cloud MCP: `read_scope` / `search_components` for the owner, `read_components` for APIs, and `read_file` for source. Don't guess IDs. Also check who calls the component, so you know whether your change stays inside one scope.
2. Run:

```bash
bit init --default-scope {{scope}}           # or reuse an existing workspace
bit import {{scope}}/<name> [...]            # every component you will change, plus the chain up to its consumers
bit lane create <lane-name>
# edit
bit validate
bit snap -m "<message>"
bit export
```

3. Watch it arrive: `gh pr list -R {{repo}} --head <lane-name>`. Then tell the user the PR link. Don't submit a bit.cloud change request.

Headless or CI agents can call the Bit Cloud MCP with a bit.cloud token, without the OAuth step:

```json
{
  "mcpServers": {
    "bit-cloud": {
      "type": "http",
      "url": "https://mcp.bit.cloud/mcp",
      "headers": { "Authorization": "Bearer ${BIT_CLOUD_TOKEN}" }
    }
  }
}
```

### Read a sync PR

- The PR body lists the mirrored components and the foreign ones (other scopes, "not mirrored").
- The bot's **run summary** comment says what the last run did: `import-lane`, `export-branch`, `merge-diverged`, `noop (converged)`.
- Runs: `gh run list --workflow bit-sync` and `gh run view <id> --log`.
- `Lane sync: <scope>/<lane>` PRs are lanes. `Bit sync: update to latest main scope versions` (branch `bit-sync/main`) brings `{{branch}}` up to the scope. Merging that one releases nothing.

### Fix a halt (`bit-sync-conflict` label)

The lane and the branch changed the same lines. The lane stays paused while the label is on the PR. The bot's comment on the PR names the components and gives these steps:

```bash
git fetch origin && git checkout '<branch>'
bit install
bit lane import '<host-scope>/<lane>'         # brings the lane's side in; conflicts appear as conflict markers
# resolve every conflicted file. When the intent is unclear, ask the user which side wins. Don't guess.
bit validate
git add -A && git commit -m "fix: resolve sync conflict"
git push origin '<branch>'
gh pr edit <pr> --remove-label bit-sync-conflict
gh workflow run bit-sync -f lane=<host-scope>/<lane>
```

The next run reports `merge-diverged` or `export-branch`, then `noop (converged)`. Never resolve by force-pushing over the bot's commits. Never delete the lane to "start fresh".

### Change several scopes at once (preview)

Prefer one lane per scope: one change, one repository, one PR.

A lane _can_ carry components from several scopes. Each scope's repository then mirrors only its own slice, consumes the other scopes' lane versions as packages, and releases its slice when its PR merges. Until automatic fan-out ships, only the repository of the lane's host scope hears about the lane. Start the others by hand:

```bash
gh workflow run bit-sync -R <org>/<repo> -f lane=<host-scope>/<lane-name>
```

### Connect another scope to its own repository

```bash
gh repo create <org>/<repo> --private --clone && cd <repo>
bit init --default-scope <owner>.<scope> --skip-interactive
bit import "<owner>.<scope>/**"
bit ci sync --init                            # writes the workflows, the sync config and this AGENTS.md section
```

Then follow the steps `bit ci sync --init` prints. Some of them need a repository or organization admin. Guide: https://bit.cloud/teambit/git/guides/connect-scope-to-repository

### Never

- Push to `{{branch}}`, or merge `bit-sync/main` and lane PRs out of order to "fix" history.
- Run `bit build`, `tsc`, `npm install` or `pnpm install` here. Use `bit validate` and `bit install`.
- Export a lane from another workspace while a Git-first PR is open for the same change. Pick one path.
- Remove a `bit-sync-conflict` label without resolving the conflict.

<!-- bit-ci-sync:end -->
