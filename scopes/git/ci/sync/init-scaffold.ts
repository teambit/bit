import fs from 'fs';
import chalk from 'chalk';
import { formatHint, formatItem, formatTitle, formatWarningSummary, joinSections, successSymbol } from '@teambit/cli';
import path from 'path';
import { parseGitHubRepo, isGitHubRemote, gitHubApiUrl, remoteHost } from './github-client';

/**
 * `bit ci sync --init` — pure scaffolding logic, unit-testable without a live workspace/git checkout.
 *
 * TEMPLATE SOURCE OF TRUTH: `BIT_SYNC_WORKFLOW_RAW` / `BIT_RELEASE_WORKFLOW_RAW` are byte-for-byte
 * copies of the canonical templates in the `bit-git-sync` action workspace
 * (git-sync/git-sync/workflows/templates/) and MUST be kept in sync with them. The ONLY departure is
 * the two `DEFAULT_BRANCH_MARKER` substitution points; everything else — CHANGE-ME comments, the
 * placeholder action ref, `bit-sync/main` config defaults — stays untouched.
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
      # Pinned to a commit SHA on purpose: this job holds write permission, and
      # a tag can move. Bump the SHA to take a new version of the action.
      - uses: teambit/bit-git-sync@66c0fdf9e34e45f70b4f397b38b2b01f79dd1f41
        with:
          # CHANGE-ME: keep this in sync with
          # \`teambit.git/ci\`.\`sync.mainSyncBranch\` in your workspace.jsonc
          # (the action's own default is shown here).
          main-sync-branch: bit-sync/main
          # Uncomment if your workspace.jsonc is NOT at the repository root --
          # the action chdirs here before running anything.
          # ws-dir: packages/my-workspace
        env:
          # Service account token. This account must be EXEMPT from the
          # org's change-request/merge block, or bit.cloud rejects the
          # sync-driven writes.
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
      # Pinned to a commit SHA on purpose: this job holds write permission, and
      # a tag can move. Bump the SHA to take a new version of the action.
      - uses: teambit/bit-git-sync@66c0fdf9e34e45f70b4f397b38b2b01f79dd1f41
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
 * The exact substring in each template that encodes the repository's default branch. Exact substring,
 * never a blanket `main` regex — that would also corrupt `bit-main-export` and `bit-sync/main`.
 */
const DEFAULT_BRANCH_MARKER = {
  sync: "branches-ignore: [main, 'bit-sync/**']",
  release: 'branches: [main]',
} as const;

/**
 * A YAML single-quoted scalar of `value` (the only escape inside single quotes is a doubled `''`).
 * Both substitution points land inside a YAML flow sequence, where `,` and `]` are structural — and a
 * branch name may legally contain both, so quoting is unconditional.
 */
function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Replace the default-branch literal inside `marker` with `defaultBranch`, inside `raw`. Throws when
 * the marker has drifted out of the template — a reworded canonical workflow must fail loudly, not
 * ship a scaffold that still says `main`.
 */
function substituteDefaultBranch(raw: string, marker: string, defaultBranch: string): string {
  if (!raw.includes(marker)) {
    throw new Error(
      `init-scaffold: expected marker "${marker}" not found in its workflow template — the canonical ` +
        `template (bitdev.git-sync/git-sync/workflows) has drifted from BIT_SYNC_WORKFLOW_RAW / ` +
        `BIT_RELEASE_WORKFLOW_RAW; update the copy and this substitution point together`
    );
  }
  // Function replacements, not strings: `$&`/`$'`/`$$` are special in string replacements and `$` is
  // git-legal in a branch name. A function replacement is inserted verbatim.
  const substitutedMarker = marker.replace('main', () => yamlSingleQuoted(defaultBranch));
  return raw.replace(marker, () => substitutedMarker);
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

// Never overwrites an existing file — `--init` must be safe to re-run after hand-edits.
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
  /** The remote's host — github.com or the GITHUB_SERVER_URL one — which picks the API the checklist names. */
  host: string;
}

/**
 * Derive `{owner, repo}` from the `origin` remote when it is a parseable GitHub remote, else
 * undefined (the checklist falls back to a placeholder). Reuses `github-client.ts`'s parsing so the
 * two never disagree.
 */
export function deriveOwnerRepo(remoteUrl: string | undefined): OwnerRepo | undefined {
  if (!remoteUrl || !isGitHubRemote(remoteUrl)) return undefined;
  const ownerSlashRepo = parseGitHubRepo(remoteUrl);
  const host = remoteHost(remoteUrl);
  if (!ownerSlashRepo || !host) return undefined;
  const [owner, repo] = ownerSlashRepo.split('/');
  if (!owner || !repo) return undefined;
  return { owner, repo, host };
}

/**
 * The bit.cloud custom webhook payload template, verified byte-perfect against a live delivery.
 * Lane vs. main export is discriminated by whether `laneId` is empty. Used on GitHub Enterprise
 * Server, where the webhook posts straight to the repository's `dispatches` API with a token.
 */
const WEBHOOK_PAYLOAD_TEMPLATE =
  '{"event_type":"bit-export","client_payload":{"laneId":"{{laneId}}","componentIds":"{{componentIds}}","owner":"{{owner}}","actor":"{{username}}"}}';

/**
 * On github.com, instant Bit -> Git goes through the hosted relay: the `bit-git-sync` GitHub App lets
 * it send `repository_dispatch` to the repositories it is installed on, and its setup page hands out
 * one webhook URL per repository. No personal token is involved.
 */
const BIT_GIT_SYNC_APP_URL = 'https://github.com/apps/bit-git-sync';
const WEBHOOK_RELAY_SETUP_URL = 'https://webhook-relay-gggmal.r2.composed.app/setup';
const SETUP_GUIDE_URL = 'https://github.com/teambit/acme-modular-store#set-it-up-for-your-own-scope';

/** What each scaffolded file does, in the words the report shows next to it. */
const FILE_PURPOSE: Record<string, string> = {
  [WORKFLOW_RELATIVE_PATHS.sync]: 'syncs lanes and branches: on export, on push, and every 30 minutes',
  [WORKFLOW_RELATIVE_PATHS.release]: 'releases the scope when a pull request merges',
};

export interface InitReportInput {
  /** the workspace's default scope, the one this repository mirrors */
  scopeId?: string;
  /** derived from the `origin` remote; undefined when there is none, or it isn't a recognized GitHub host */
  ownerRepo?: OwnerRepo;
  /** the raw `origin` URL, to name a remote that exists but isn't recognized as GitHub */
  originUrl?: string;
  defaultBranch: string;
  /** true when the remote didn't name its default branch and `defaultBranch` is a guess */
  defaultBranchGuessed?: boolean;
  /**
   * The repository root as seen from where the user stands (`.` when they stand in it). The workflows
   * live there, so the first commit and `gh repo create --source` must name it.
   */
  repoRootFromCwd?: string;
  /**
   * false when the repository has no commit yet. The first commit then takes the whole workspace;
   * after that, the commit takes only the files `--init` touched, never unrelated local changes.
   */
  repoHasCommits?: boolean;
  /** scaffolded workflow files, with the path to show (relative to where the user stands) */
  files: Array<ScaffoldFileOutcome & { displayPath: string }>;
  /** workspace.jsonc, as seen from where the user stands */
  configDisplayPath?: string;
  /** whether `--init` added the sync block to workspace.jsonc, or found one already there */
  configAdded: boolean;
}

/**
 * A remote that is a path on this machine (a bare repository, a `file://` URL), not a server. It has
 * no host to suggest as a GitHub Enterprise Server.
 */
export function isLocalPathRemote(remoteUrl: string): boolean {
  return /^(?:\/|\.{1,2}[/\\]|~|file:\/\/|[a-z]:[/\\])/i.test(remoteUrl.trim());
}

/**
 * The remote URL without the credentials a URL can carry (`https://user:token@host/...`), so the
 * report never prints a token. An http(s) user name can itself be a token, so all of it goes; other
 * schemes keep the user name (`ssh://git@host`) and lose only a password.
 */
export function redactRemoteUrl(remoteUrl: string): string {
  const url = remoteUrl.trim();
  if (/^https?:\/\//i.test(url)) return url.replace(/^(https?:\/\/)[^@/]*@/i, '$1');
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:@/]*):[^@/]*@/i, '$1@');
}

/**
 * Quote a value for a POSIX shell, so a command the report prints runs as shown when pasted. Plain
 * names stay unquoted for readability; anything else is single-quoted. A git-valid branch such as
 * `$(id)` must not run as a command substitution.
 */
export function shellQuote(value: string): string {
  return /^[\w./@:+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The default branch `--init` writes into the workflows: the one the remote names, else a guess. The
 * guess is the checked-out branch only when it is `main` or `master`: a feature branch in the branch
 * filters would exclude itself from sync and point releases at the wrong base.
 */
export function chooseInitDefaultBranch(detected: string | undefined, current: string | undefined): string {
  if (detected) return detected;
  return current === 'main' || current === 'master' ? current : 'main';
}

/**
 * The `GITHUB_SERVER_URL` to suggest for a remote bit doesn't recognize: an http(s) remote's own origin,
 * port included, else https on the remote's host (an ssh port is not the web server's).
 */
export function suggestedServerUrl(remoteUrl: string): string {
  if (/^https?:\/\//i.test(remoteUrl.trim())) {
    try {
      return new URL(remoteUrl.trim()).origin;
    } catch {
      // fall through to the host
    }
  }
  return `https://${remoteHost(remoteUrl) ?? '<your-server>'}`;
}

/**
 * The report `bit ci sync --init` prints: what it changed, then the steps that need a person, as
 * commands to paste. Short by design; the setup guide carries the details. Commands are printed only
 * for a resolved repository: a placeholder would not run when pasted.
 */
export function renderInitReport(input: InitReportInput): string {
  const { ownerRepo, defaultBranch } = input;
  const scope = input.scopeId ?? '<scope>';
  // An origin that isn't recognized is most often a GitHub Enterprise Server the shell doesn't know about.
  const unrecognizedOrigin = !ownerRepo && input.originUrl ? redactRemoteUrl(input.originUrl) : undefined;
  // Suggest a server only for a remote that names a host: a local path has none.
  const serverHost =
    unrecognizedOrigin && !isLocalPathRemote(unrecognizedOrigin) ? remoteHost(unrecognizedOrigin) : undefined;
  const repoRootFromCwd = input.repoRootFromCwd || '.';
  const configDisplayPath = input.configDisplayPath || 'workspace.jsonc';

  const target = ownerRepo
    ? chalk.cyan(
        ownerRepo.host === 'github.com'
          ? `${ownerRepo.owner}/${ownerRepo.repo}`
          : `${ownerRepo.host}/${ownerRepo.owner}/${ownerRepo.repo}`
      )
    : unrecognizedOrigin
      ? `origin ${unrecognizedOrigin}`
      : 'no GitHub remote yet';
  const header = [
    `${successSymbol()} ${formatTitle('Scaffolded bit ci sync')} for ${chalk.cyan(scope)}, mirrored to ${target} ${formatHint(
      `(default branch: ${defaultBranch})`
    )}`,
  ];
  if (input.defaultBranchGuessed) {
    const why = input.originUrl ? "the remote didn't name its default branch" : 'no remote names the default branch';
    header.push(
      formatWarningSummary(
        `${why}, so the workflows use "${defaultBranch}". If that's wrong,\n` +
          `  edit the branch filters in both workflow files.`
      )
    );
  }
  if (serverHost && unrecognizedOrigin) {
    header.push(
      formatWarningSummary("origin isn't a GitHub remote bit recognizes. For GitHub Enterprise Server, run:")
    );
    header.push(
      `  ${chalk.cyan(`GITHUB_SERVER_URL=${shellQuote(suggestedServerUrl(unrecognizedOrigin))} bit ci sync --init`)}`
    );
  }

  const width = Math.max(...input.files.map((f) => f.displayPath.length), configDisplayPath.length) + 2;
  const fileItem = (displayPath: string, note: string) => formatItem(`${displayPath.padEnd(width)}${formatHint(note)}`);
  const files = [
    ...input.files.map((file) =>
      fileItem(
        file.displayPath,
        file.status === 'written' ? (FILE_PURPOSE[file.relativePath] ?? '') : 'already exists, left unchanged'
      )
    ),
    fileItem(
      configDisplayPath,
      input.configAdded ? 'added "teambit.git/ci": { "sync": {} }' : 'already configures sync, left unchanged'
    ),
  ];

  const step = (n: number, title: string, who: string, body: string[]) =>
    [`${formatTitle(`${n}. ${title}`)} ${formatHint(`(${who})`)}`, ...body.map((line) => `   ${line}`)].join('\n');
  const cmd = (text: string) => chalk.cyan(text);
  // Stage only what `--init` touched, so unrelated local changes stay out of the commit. The first
  // commit of a new repository is the exception: it must carry the whole workspace. `:/` stages from
  // the repository root, where the workflows are, when the workspace is a subdirectory.
  const stage =
    input.repoHasCommits === false
      ? repoRootFromCwd === '.'
        ? 'git add -A'
        : 'git add -A :/'
      : `git add -- ${[...input.files.map((f) => f.displayPath), configDisplayPath].map(shellQuote).join(' ')}`;
  // Commit and push are separate: on a re-run nothing may be left to commit, and the push must still run.
  const commit = [cmd(stage), cmd(`git commit -m ${shellQuote(`Mirror ${scope}`)}`)];

  const steps: string[] = [];
  if (!ownerRepo) {
    steps.push(
      unrecognizedOrigin
        ? step(1, 'Push it', 'you', [...commit, cmd('git push -u origin HEAD')])
        : step(1, 'Create the repository and push it', 'you', [
            ...commit,
            cmd(`gh repo create --private --source ${shellQuote(repoRootFromCwd)} --remote origin --push`),
            formatHint('names the repository after its root folder; add OWNER/NAME after "create" to choose'),
          ]),
      step(2, 'Run bit ci sync --init again', 'you', [
        'Once origin is a GitHub remote bit recognizes, it prints the secret, permission and webhook',
        'steps for your repository as commands.',
      ])
    );
  } else {
    const onGitHubCom = ownerRepo.host === 'github.com';
    const repo = `${ownerRepo.owner}/${ownerRepo.repo}`;
    // gh takes HOST/OWNER/REPO, or --hostname, for an enterprise server
    const ghRepo = shellQuote(onGitHubCom ? repo : `${ownerRepo.host}/${repo}`);
    const ghApi = onGitHubCom ? 'gh api' : `gh api --hostname ${shellQuote(ownerRepo.host)}`;
    steps.push(
      step(1, 'Push it', 'you', [...commit, cmd('git push -u origin HEAD')]),
      step(2, 'Let the workflows publish to bit.cloud and open pull requests', 'repository admin', [
        cmd(`gh secret set BIT_CONFIG_ACCESS_TOKEN -R ${ghRepo}`),
        formatHint(`a bit.cloud access token with Write permission on ${scope}. If your organization`),
        formatHint("requires change requests, exempt the token's account: it is the one that merges lanes."),
        cmd(`${ghApi} -X PUT ${shellQuote(`repos/${repo}/actions/permissions/workflow`)} \\`),
        cmd('  -F can_approve_pull_request_reviews=true'),
        formatHint('turns on "Allow GitHub Actions to create and approve pull requests"'),
        cmd(`gh secret set BIT_SYNC_GH_TOKEN -R ${ghRepo}`),
        formatHint('optional: a GitHub token, so the pushes the sync makes start your other workflows (CI checks)'),
      ])
    );
    if (onGitHubCom) {
      steps.push(
        step(3, 'Make Bit -> Git instant', 'organization admin, optional', [
          `Install ${chalk.cyan(BIT_GIT_SYNC_APP_URL)} on ${repo}.`,
          `Copy the repository's webhook URL from ${chalk.cyan(WEBHOOK_RELAY_SETUP_URL)}`,
          `and add it to ${scope} on bit.cloud as an "Export succeeded" webhook.`,
        ])
      );
    } else {
      const api = gitHubApiUrl(ownerRepo.host);
      const dispatchUrl = `${'error' in api ? '<GitHub API URL>' : api.url}/repos/${repo}/dispatches`;
      steps.push(
        step(3, 'Make Bit -> Git instant', 'optional', [
          `On bit.cloud, add an "Export succeeded" webhook to ${scope}:`,
          `  URL      ${chalk.cyan(dispatchUrl)}`,
          ...('error' in api ? [chalk.yellow(`  (${api.error})`)] : []),
          '  Headers  Authorization: Bearer <token with access to this repository>',
          '           Accept: application/vnd.github+json',
          `  Payload  ${WEBHOOK_PAYLOAD_TEMPLATE}`,
          formatHint('Create it fresh: editing a bit.cloud webhook drops its custom headers.'),
        ])
      );
    }
  }

  const footer = ownerRepo
    ? `After step 2 the sync runs on pushes to feature branches and every 30 minutes; step 3 adds instant Bit -> Git.\nGuide: ${SETUP_GUIDE_URL}`
    : `Guide: ${SETUP_GUIDE_URL}`;
  return joinSections([
    header.join('\n'),
    files.join('\n'),
    [formatTitle(`Next: ${steps.length} steps to go live`), '', steps.join('\n\n')].join('\n'),
    formatHint(footer),
  ]);
}
