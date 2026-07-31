import fs from 'fs';
import path from 'path';
import { parseGitHubRepo, isGitHubRemote } from './github-client';

/**
 * `bit ci sync --init` — pure scaffolding logic (template rendering, file writes, checklist text).
 *
 * Kept separate from `ci.main.runtime.ts` so the substitution and checklist logic can be unit-tested
 * without a live `Workspace`/git checkout. The one part that genuinely needs the live workspace
 * instance — writing `"teambit.git/ci": { "sync": {} }` into workspace.jsonc through the
 * comment-preserving `WorkspaceConfig` API (see `workspace/scope-trust/scope-trust.ts` for the same
 * pattern: `getWorkspaceConfig().setExtension(..., { mergeIntoExisting: true })` then `.write()`) —
 * stays in `ci.main.runtime.ts`, the only place that already holds a `Workspace` reference. That is
 * the "robust path" chosen over printing the config block for the user to paste: it preserves existing
 * comments/keys under `teambit.git/ci` and is idempotent by construction (skips when `sync` already
 * exists).
 *
 * TEMPLATE SOURCE OF TRUTH: `BIT_SYNC_WORKFLOW_RAW` and `BIT_RELEASE_WORKFLOW_RAW` below are copied
 * VERBATIM (byte-for-byte, including every comment) from the `bit-git-sync` action workspace's
 * canonical templates:
 *   git-sync/git-sync/workflows/templates/bit-sync.yml
 *   git-sync/git-sync/workflows/templates/bit-release.yml
 *
 * They MUST be kept in sync with those files. The ONLY departure from a byte-for-byte copy is the two
 * `DEFAULT_BRANCH_MARKER` substitution points below — everything else, including the CHANGE-ME
 * comments and the placeholder `uses: luvktest/bit-git-sync@v1` action ref, is left untouched on
 * purpose:
 *   - the action ref has no way to be auto-detected (per the design contract, it stays the placeholder
 *     with its own CHANGE-ME comment);
 *   - rewriting prose that mentions `main` in passing (the header comment, the CHANGE-ME comment text)
 *     is not a "hardcoded main branch literal" in the sense the contract means — it is documentation
 *     for a human hand-copying the file, and touching it risks this generator silently drifting from
 *     the canonical template's wording on the next update. Only the two functional YAML values that
 *     actually gate which branch triggers/skips a workflow are substituted;
 *   - `bit-sync/main` (the `mainSyncBranch` config default) is left as-is everywhere it appears — it is
 *     a *config* default, not the repository's default branch, and stays correct unless the customer's
 *     `sync.mainSyncBranch` override make it wrong (in which case they were always going to hand-edit
 *     the CHANGE-ME lines that name it).
 */

/** Where `scaffoldWorkflowFiles` writes each file, relative to the workspace root. */
export const WORKFLOW_RELATIVE_PATHS = {
  sync: path.join('.github', 'workflows', 'bit-sync.yml'),
  release: path.join('.github', 'workflows', 'bit-release.yml'),
} as const;

const BIT_SYNC_WORKFLOW_RAW = `# Copy this file into your repository at \`.github/workflows/bit-sync.yml\`,
# then review every line marked \`CHANGE-ME\` below -- the defaults assume a
# repository whose default branch is \`main\` and a workspace at the repo root.
#
# See the \`workflows.docs.mdx\` customer setup guide (component
# bitdev.git-sync/git-sync/workflows) for the full walk-through: the
# bit.cloud webhook wiring that drives \`repository_dispatch\`, the required
# secrets, and the \`teambit.git/ci\`.\`sync\` workspace config this workflow
# acts on.
name: bit-sync
on:
  repository_dispatch:
    # 'bit-export' is the real, empirically-verified bit.cloud webhook
    # contract: a single dispatch type discriminated by
    # client_payload.laneId (non-empty 'scope/lane' -> lane export, empty ->
    # main export). The other three types are forward-compat aliases the
    # event router also accepts, in case a webhook is configured to send the
    # originally-assumed, more granular dispatch types instead.
    types: [bit-export, bit-lane-export, bit-main-export, bit-lane-removed]
  schedule:
    # Scheduled reconcile. This is also the ONLY mechanism that picks up
    # lane deletions -- bit.cloud has no "lane removed" webhook event.
    - cron: '*/30 * * * *'
  push:
    # CHANGE-ME: \`main\` must be your repository's DEFAULT branch, and
    # \`bit-sync/**\` must cover your configured \`sync.mainSyncBranch\`. Pushes
    # to either are bit-sync's own output and must not re-trigger a sync.
    branches-ignore: [main, 'bit-sync/**']
  workflow_dispatch:
    inputs:
      lane: { description: Lane to sync (empty = all), required: false }

# The default GITHUB_TOKEN is READ-ONLY on repositories and organizations
# created after Feb 2023, and anywhere the org/repo default is set to
# "Read repository contents permission". Sync pushes branches and
# opens/updates PRs, so both scopes must be declared explicitly -- without
# this block the sync fails with a 403 on its first write.
permissions:
  contents: write
  pull-requests: write

concurrency:
  # Serializes one lane's syncs so two runs never race on the same branch/PR.
  #
  # Each trigger needs a different expression, because the lane identity
  # arrives in a different place every time:
  #   - repository_dispatch -> client_payload.laneId ('scope/lane'), or
  #                            client_payload.lane for the alias types
  #   - push                -> github.ref_name (the branch)
  #   - workflow_dispatch    -> the \`lane\` input
  #   - schedule             -> nothing lane-shaped; it reconciles everything
  #
  # github.ref_name is populated on schedule runs too (it is the default
  # branch there), so it may only be consulted AFTER the event name has been
  # checked. Reading it first -- as a bare \`... || github.ref_name || 'all'\`
  # chain does -- makes the final fallback unreachable and lumps every cron
  # run into the same group as pushes to the default branch.
  #
  # RESIDUAL RACE (accepted, by design): a webhook run groups as
  # 'scope/my-lane' while a push to that lane's branch groups as 'my-lane', so
  # two runs for the same lane can still overlap across those two triggers.
  # GitHub expressions have no substring/split function, and bit.cloud's
  # webhook payload template exposes only the full laneId, so the two keys
  # cannot be normalized into one here. This is safe rather than merely
  # tolerated: the reconciler is idempotent and the sync executor diffs
  # against converged state, so a second overlapping run finds nothing left to
  # do and no-ops. The concurrency group is an efficiency measure; it is not
  # what makes the sync correct.
  group: >-
    bit-sync-\${{
    github.event_name == 'repository_dispatch' && (github.event.client_payload.laneId || github.event.client_payload.lane || 'main-export')
    || github.event_name == 'push' && github.ref_name
    || github.event_name == 'workflow_dispatch' && (github.event.inputs.lane || 'reconcile-all')
    || 'reconcile-all' }}
  # Never cancel a sync mid-flight: it may already have pushed a branch and be
  # partway through opening or updating its PR.
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          # A PAT/App token so that pushes this workflow makes (e.g. a sync
          # PR branch) can themselves trigger CI. Pushes authenticated with
          # the default GITHUB_TOKEN do NOT trigger other workflow runs.
          token: \${{ secrets.BIT_SYNC_GH_TOKEN || secrets.GITHUB_TOKEN }}
      - uses: bit-tasks/init@v2
      # CHANGE-ME: \`luvktest/bit-git-sync@v1\` is a placeholder pointing at this
      # workspace's own repo path. Replace it with wherever you publish this
      # action (your own fork, or its published marketplace location) and pin
      # it to a release tag or a commit SHA.
      - uses: luvktest/bit-git-sync@v1
        with:
          # CHANGE-ME: keep this in sync with
          # \`teambit.git/ci\`.\`sync.mainSyncBranch\` in your workspace.jsonc
          # (the action's own default is shown here).
          main-sync-branch: bit-sync/main
          # Uncomment if your workspace.jsonc is NOT at the repository root --
          # the action chdirs here before running anything.
          # ws-dir: packages/my-workspace
        env:
          # Service account token. In Mode A (git-source-of-truth), this
          # account must be EXEMPT from the org's change-request/merge
          # block, or bit.cloud rejects the sync-driven writes.
          BIT_CONFIG_ACCESS_TOKEN: \${{ secrets.BIT_CONFIG_ACCESS_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.BIT_SYNC_GH_TOKEN || secrets.GITHUB_TOKEN }}
          # Optional: git identity for the commits the sync creates. Defaults
          # to bit-sync[bot] / bit-sync[bot]@users.noreply.github.com.
          # GIT_USER_NAME: bit-sync[bot]
          # GIT_USER_EMAIL: bit-sync[bot]@users.noreply.github.com
`;

const BIT_RELEASE_WORKFLOW_RAW = `# Copy this file into your repository at \`.github/workflows/bit-release.yml\`,
# then review every line marked \`CHANGE-ME\` below.
#
# See the \`workflows.docs.mdx\` customer setup guide (component
# bitdev.git-sync/git-sync/workflows) for the full walk-through.
name: bit-release
on:
  pull_request:
    types: [closed]
    # CHANGE-ME: your repository's DEFAULT branch. \`bit ci merge\` releases
    # from the default branch, so only PRs merged INTO it should trigger a
    # release -- a stacked PR landing on another feature branch has not
    # reached the default branch yet. The action's event router enforces the
    # same rule from \`pull_request.base.ref\`; this filter means a run is never
    # even queued for a non-default base.
    branches: [main]

# The default GITHUB_TOKEN is READ-ONLY on repositories and organizations
# created after Feb 2023, and anywhere the org/repo default is set to
# "Read repository contents permission". The release run pushes commits/tags
# and updates PRs, so both scopes must be declared explicitly.
permissions:
  contents: write
  pull-requests: write

concurrency:
  group: bit-release-\${{ github.event.pull_request.number }}
  # Never cancel a release mid-flight.
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    # Merged main-sync PRs must NOT trigger a release: the scope is already
    # ahead of this merge, there is nothing new to release. The event
    # router also skips this case (routePullRequest checks
    # prHeadRef === mainSyncBranch) -- this \`if:\` is defense in depth so the
    # job doesn't even start.
    # CHANGE-ME: the branch literal below MUST match your workspace's
    # configured \`teambit.git/ci\`.\`sync.mainSyncBranch\`.
    if: github.event.pull_request.merged == true && github.event.pull_request.head.ref != 'bit-sync/main'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: \${{ secrets.BIT_SYNC_GH_TOKEN || secrets.GITHUB_TOKEN }}
      - uses: bit-tasks/init@v2
      # CHANGE-ME: \`luvktest/bit-git-sync@v1\` is a placeholder pointing at this
      # workspace's own repo path. Replace it with wherever you publish this
      # action (your own fork, or its published marketplace location) and pin
      # it to a release tag or a commit SHA.
      - uses: luvktest/bit-git-sync@v1
        with:
          # CHANGE-ME: keep this in sync with
          # \`teambit.git/ci\`.\`sync.mainSyncBranch\` AND with the \`if:\`
          # condition above.
          main-sync-branch: bit-sync/main
          # Uncomment if your workspace.jsonc is NOT at the repository root --
          # the action chdirs here before running anything.
          # ws-dir: packages/my-workspace
        env:
          BIT_CONFIG_ACCESS_TOKEN: \${{ secrets.BIT_CONFIG_ACCESS_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.BIT_SYNC_GH_TOKEN || secrets.GITHUB_TOKEN }}
          # Optional: git identity for the commits the release creates.
          # Defaults to bit-sync[bot] / bit-sync[bot]@users.noreply.github.com.
          # GIT_USER_NAME: bit-sync[bot]
          # GIT_USER_EMAIL: bit-sync[bot]@users.noreply.github.com
`;

/**
 * The exact substring in each raw template that encodes "the repository's default branch", and
 * nothing else. Substituting by exact substring rather than a blanket `main` regex is deliberate:
 * `\bmain\b` also matches inside `bit-main-export` / `main-export` (the dispatch-type alias and the
 * comment describing it) and inside `bit-sync/main` (the `mainSyncBranch` default) — none of which
 * are the repository's default branch, and a blanket replace would corrupt them.
 */
const DEFAULT_BRANCH_MARKER = {
  sync: "branches-ignore: [main, 'bit-sync/**']",
  release: 'branches: [main]',
} as const;

/**
 * Replace the single default-branch literal inside `marker` with `defaultBranch`, inside `raw`.
 * Throws rather than silently no-op-ing if the marker has drifted out of the template — a change to
 * the canonical workflow that moves or rewords this line must fail this substitution loudly instead of
 * shipping a scaffolded workflow that still says `main` on the wrong line.
 */
function substituteDefaultBranch(raw: string, marker: string, defaultBranch: string): string {
  if (!raw.includes(marker)) {
    throw new Error(
      `init-scaffold: expected marker "${marker}" not found in its workflow template — the canonical ` +
        `template (bitdev.git-sync/git-sync/workflows) has drifted from BIT_SYNC_WORKFLOW_RAW / ` +
        `BIT_RELEASE_WORKFLOW_RAW; update the copy and this substitution point together`
    );
  }
  return raw.replace(marker, marker.replace('main', defaultBranch));
}

/** Render `bit-sync.yml` with the repository's actual default branch substituted. */
export function renderBitSyncWorkflow(defaultBranch: string): string {
  return substituteDefaultBranch(BIT_SYNC_WORKFLOW_RAW, DEFAULT_BRANCH_MARKER.sync, defaultBranch);
}

/** Render `bit-release.yml` with the repository's actual default branch substituted. */
export function renderBitReleaseWorkflow(defaultBranch: string): string {
  return substituteDefaultBranch(BIT_RELEASE_WORKFLOW_RAW, DEFAULT_BRANCH_MARKER.release, defaultBranch);
}

export interface ScaffoldFileOutcome {
  /** relative to the workspace root, e.g. `.github/workflows/bit-sync.yml` */
  relativePath: string;
  status: 'written' | 'skipped';
}

/**
 * Write one workflow file under `workspaceDir`, refusing to overwrite a file that already exists —
 * `--init` must be safe to re-run (e.g. after a customer hand-edited the CHANGE-ME lines, or just to
 * pick up the other file after fixing a typo in one of them).
 */
function writeIfAbsent(workspaceDir: string, relativePath: string, content: string): ScaffoldFileOutcome {
  const absPath = path.join(workspaceDir, relativePath);
  if (fs.existsSync(absPath)) {
    return { relativePath, status: 'skipped' };
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return { relativePath, status: 'written' };
}

/** Scaffold both workflow files under `workspaceDir`. Never overwrites; creates `.github/workflows/` as needed. */
export function scaffoldWorkflowFiles(workspaceDir: string, defaultBranch: string): ScaffoldFileOutcome[] {
  return [
    writeIfAbsent(workspaceDir, WORKFLOW_RELATIVE_PATHS.sync, renderBitSyncWorkflow(defaultBranch)),
    writeIfAbsent(workspaceDir, WORKFLOW_RELATIVE_PATHS.release, renderBitReleaseWorkflow(defaultBranch)),
  ];
}

export interface OwnerRepo {
  owner: string;
  repo: string;
}

/**
 * Derive `{owner, repo}` from the `origin` remote URL when it is a parseable GitHub remote, else
 * `undefined` (a non-GitHub host, a local/`file://` remote used in tests, or no remote at all) — the
 * checklist falls back to a `<owner>/<repo>` placeholder in that case. Reuses the same parsing
 * `github-client.ts` uses to pick the git host provider, so the two never disagree about what counts
 * as "this remote is GitHub, and this is its owner/repo".
 */
export function deriveOwnerRepo(remoteUrl: string | undefined): OwnerRepo | undefined {
  if (!remoteUrl || !isGitHubRemote(remoteUrl)) return undefined;
  const ownerSlashRepo = parseGitHubRepo(remoteUrl);
  if (!ownerSlashRepo) return undefined;
  const [owner, repo] = ownerSlashRepo.split('/');
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

/**
 * The bit.cloud custom webhook payload template, verified byte-perfect against a live delivery (see
 * the design spec's §3, "bit.cloud webhook events"). Discriminates lane vs. main export on the
 * receiving end by whether `laneId` is empty.
 */
const WEBHOOK_PAYLOAD_TEMPLATE =
  '{"event_type":"bit-export","client_payload":{"laneId":"{{laneId}}","componentIds":"{{componentIds}}","owner":"{{owner}}","actor":"{{username}}"}}';

/**
 * The manual-steps checklist `bit ci sync --init` prints after scaffolding: everything the command
 * itself cannot do (secrets live in GitHub settings; the webhook lives on bit.cloud). Content is fixed
 * by the "Zero-touch onboarding" design contract — secrets, the permissions note, the bit.cloud webhook
 * recipe (URL, headers, payload template, the header-drop warning), and the fetch-depth:0 requirement.
 */
export function renderInitChecklist(ownerRepo: OwnerRepo | undefined): string {
  const repoSegment = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : '<owner>/<repo>';
  const dispatchUrl = `https://api.github.com/repos/${repoSegment}/dispatches`;
  return [
    '',
    'Remaining manual steps (bit ci sync --init only scaffolds files -- these need a human):',
    '',
    '1. Secrets -- add in the repository (or org) Settings > Secrets and variables > Actions:',
    '   - BIT_CONFIG_ACCESS_TOKEN (required): a bit.cloud service-account token with export rights on',
    "     this scope. In Mode A (git-source-of-truth) this account must also be exempt from the org's",
    '     change-request/merge block -- it is the only identity that merges lanes.',
    '   - BIT_SYNC_GH_TOKEN (optional): a GitHub PAT or App token. Without it, sync pushes/PRs use the',
    '     default GITHUB_TOKEN, which does NOT trigger downstream workflow runs (loop-safe, but the',
    '     sync PR then gets no CI checks).',
    '',
    '2. Permissions -- both scaffolded workflows already declare `contents: write` and',
    '   `pull-requests: write`. Nothing to change unless an org-wide policy overrides workflow-level',
    '   permissions (e.g. a default of "Read repository contents permission" for the GITHUB_TOKEN).',
    '',
    '3. bit.cloud webhook -- create ONE webhook (org Settings > Webhooks) on the "Components > Export',
    '   succeeded" event:',
    `   URL:     ${dispatchUrl}`,
    '   Headers: Authorization: Bearer <PAT>',
    '            Accept: application/vnd.github+json',
    '   Custom payload template:',
    `   ${WEBHOOK_PAYLOAD_TEMPLATE}`,
    '   WARNING: create this webhook fresh -- editing an existing webhook drops its custom headers',
    '   (known bit.cloud platform bug, verified 2026-07-29). If the URL, headers or template need to',
    '   change later, delete the webhook and create a new one rather than editing it.',
    '',
    '4. Checkout depth -- both scaffolded workflows already check out with `fetch-depth: 0`. This is',
    '   required: the reconciler reads full git history, and a shallow (--depth=1) clone fails sync',
    '   safely but uselessly (HALTED, no writes). Keep `fetch-depth: 0` if you customize the workflow.',
    '   Narrowing the REFSPEC is fine, though -- a single-branch clone is supported, because every',
    '   fetch sync performs names +refs/heads/*:refs/remotes/origin/* explicitly.',
    '',
  ].join('\n');
}
