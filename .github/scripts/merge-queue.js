/**
 * Custom merge queue for teambit/bit.
 *
 * Why not GitHub's native merge queue: after every merge to master, CircleCI's `bit_merge` job
 * runs `bit ci merge --build` (~40m) and then pushes a "bump teambit version" commit directly to
 * master. A native queue assumes only it moves the protected branch and can't model that
 * post-merge phase, so PRs would land mid-`bit_merge` and hit version churn.
 *
 * How this works instead:
 * - Enrollment: a PR joins the queue by enabling GitHub's native auto-merge (squash). No labels.
 * - Ordering: FIFO by `autoMergeRequest.enabledAt` (disabling + re-enabling moves you to the back).
 * - Gate: this script owns the `merge-queue/turn` commit status, which is a required check on
 *   master. It stays `pending` on every queued PR except the one whose turn it is; flipping it to
 *   `success` lets GitHub's own auto-merge perform the actual squash-merge. The bot never merges.
 * - Turn-taking ("fast" mode): when master is settled, the FIRST queued PR that is green,
 *   mergeable, and up to date with master gets the turn. PRs with failing/pending checks or
 *   conflicts keep their queue position but are passed over until they recover.
 * - Branch updates: master's protection has "require branches to be up to date" (strict), and
 *   every bump commit makes all open PRs BEHIND — so without updates the queue would starve.
 *   When master is settled and no PR can merge right now, the bot presses "Update branch" on the
 *   first eligible behind PR (mergeable, checks not failing) and waits for its checks to re-run.
 *   It never updates while bit_merge is running (the imminent bump commit would immediately make
 *   the update stale), and never updates when another PR is about to merge (same reason).
 * - "Settled" means no `bit_merge` job is running/queued on master (checked via the CircleCI API).
 *   A FAILED `bit_merge` still counts as settled on purpose: Slack already alerts on it, and a
 *   queued PR may be the fix — blocking the queue would deadlock.
 * - Visibility: the gate status description shows each PR's position/reason, and a pinned
 *   "Merge Queue Dashboard" issue (label: merge-queue) is kept up to date.
 *
 * The loop is stateless and idempotent: every run re-derives the queue from the GitHub + CircleCI
 * APIs, so a skipped or crashed run costs nothing.
 *
 * Required env: GITHUB_TOKEN (statuses+issues write), CIRCLE_TOKEN (CircleCI API, read).
 * Optional env: MERGE_QUEUE_IGNORE_CHECKS — comma-separated check names to ignore when deciding
 * whether a PR is green.
 *
 * Rollout note: `merge-queue/turn` must be added to master's required status checks for the gate
 * to hold anything back. Keep "enforce for administrators" OFF — `bit_merge` pushes the bump
 * commit directly to master with an admin token and relies on the admin bypass.
 */

// console is this script's logging channel — the output IS the GitHub Actions run log
/* eslint-disable no-console */

const OWNER = 'teambit';
const REPO = 'bit';
const GATE_CONTEXT = 'merge-queue/turn';
const DASHBOARD_LABEL = 'merge-queue';
const DASHBOARD_TITLE = 'Merge Queue Dashboard';
const CIRCLE_PROJECT_SLUG = 'gh/teambit/bit';
const MERGE_WORKFLOW_NAME = 'build_and_test';
const MERGE_JOB_NAME = 'bit_merge';
const RECENT_PIPELINES_TO_INSPECT = 10;
// job statuses meaning bit_merge is still going to run or is running (incl. waiting in the
// CircleCI serial-group). Terminal statuses (success/failed/canceled/...) mean settled.
const ACTIVE_JOB_STATUSES = new Set(['running', 'queued', 'not_running', 'blocked', 'on_hold', 'retried']);
// workflow statuses under which a contained bit_merge job could still be active; anything
// terminal (success/failed/error/canceled/not_run) is skipped without fetching its jobs.
const ACTIVE_WORKFLOW_STATUSES = new Set(['created', 'running', 'failing', 'on_hold']);
const MAX_STATUS_DESCRIPTION_LENGTH = 140;

const githubToken = process.env.GITHUB_TOKEN;
const circleToken = process.env.CIRCLE_TOKEN;
// MERGE_QUEUE_DRY_RUN=true: read everything, decide everything, mutate nothing (no statuses, no
// dashboard writes). For local testing and safe rollout observation.
const dryRun = process.env.MERGE_QUEUE_DRY_RUN === 'true';

async function githubRequest(method, path, body) {
  const options = {
    method,
    headers: {
      authorization: `Bearer ${githubToken}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  };
  if (body) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`https://api.github.com${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`GitHub ${method} ${path} failed: ${response.status} ${text}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? undefined : response.json();
}

async function githubGraphql(query) {
  const result = await githubRequest('POST', '/graphql', { query });
  if (result.errors) {
    throw new Error(`GitHub GraphQL failed: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

async function circleRequest(path) {
  const response = await fetch(`https://circleci.com/api/v2${path}`, {
    headers: { 'Circle-Token': circleToken },
  });
  if (!response.ok) {
    throw new Error(`CircleCI GET ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/**
 * Master is "settled" when no bit_merge job is active on any recent master pipeline. Also guards
 * the gap between a merge landing and CircleCI creating its pipeline: a non-[skip ci] HEAD with no
 * pipeline yet is treated as unsettled.
 */
async function getMasterState() {
  const branch = await githubRequest('GET', `/repos/${OWNER}/${REPO}/branches/master`);
  const headSha = branch.commit.sha;
  const headMessage = branch.commit.commit.message || '';

  const { items: pipelines = [] } = await circleRequest(`/project/${CIRCLE_PROJECT_SLUG}/pipeline?branch=master`);
  const recentPipelines = pipelines.slice(0, RECENT_PIPELINES_TO_INSPECT);

  const headIsSkipCi = headMessage.includes('[skip ci]') || headMessage.includes('[ci skip]');
  const headHasPipeline = recentPipelines.some((pipeline) => pipeline.vcs && pipeline.vcs.revision === headSha);
  if (!headIsSkipCi && !headHasPipeline) {
    return { settled: false, reason: `pipeline for master HEAD ${headSha.slice(0, 9)} not created yet` };
  }

  for (const pipeline of recentPipelines) {
    const { items: workflows = [] } = await circleRequest(`/pipeline/${pipeline.id}/workflow`);
    for (const workflow of workflows) {
      if (workflow.name !== MERGE_WORKFLOW_NAME) continue;
      if (!ACTIVE_WORKFLOW_STATUSES.has(workflow.status)) continue;
      const { items: jobs = [] } = await circleRequest(`/workflow/${workflow.id}/job`);
      const mergeJob = jobs.find((job) => job.name === MERGE_JOB_NAME);
      if (mergeJob && ACTIVE_JOB_STATUSES.has(mergeJob.status)) {
        return { settled: false, reason: `bit_merge is ${mergeJob.status} on pipeline #${pipeline.number}` };
      }
    }
  }
  return { settled: true, reason: 'no active bit_merge on master' };
}

async function fetchOpenPullRequests() {
  // paginate so a queued PR beyond the first page can never be silently unmanaged; the cap is a
  // runaway guard, not an expected size
  const maxPages = 10;
  const pullRequests = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const { pageNodes, pageInfo } = await fetchOpenPullRequestsPage(cursor);
    pullRequests.push(...pageNodes);
    if (!pageInfo.hasNextPage) return pullRequests;
    cursor = pageInfo.endCursor;
  }
  console.log(`warning: more than ${maxPages * 100} open PRs; reconciling only the first ${pullRequests.length}`);
  return pullRequests;
}

async function fetchOpenPullRequestsPage(cursor) {
  const afterClause = cursor ? `, after: "${cursor}"` : '';
  const query = `{
    repository(owner: "${OWNER}", name: "${REPO}") {
      pullRequests(states: OPEN, first: 100${afterClause}, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          isDraft
          mergeable
          mergeStateStatus
          headRefOid
          baseRefName
          author { login }
          autoMergeRequest { enabledAt }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  contexts(first: 100) {
                    totalCount
                    nodes {
                      __typename
                      ... on StatusContext { context state description targetUrl }
                      ... on CheckRun { name status conclusion }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;
  const data = await githubGraphql(query);
  return { pageNodes: data.repository.pullRequests.nodes, pageInfo: data.repository.pullRequests.pageInfo };
}

function getCheckContexts(pullRequest) {
  return pullRequest.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
}

/** true when the PR has more check contexts than the single page we fetched */
function hasTruncatedCheckContexts(pullRequest) {
  const contexts = pullRequest.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  return Boolean(contexts && contexts.totalCount > contexts.nodes.length);
}

/** current state/description/target-url of our own gate status on the PR's head commit, if any */
function getGateStatus(pullRequest) {
  const gate = getCheckContexts(pullRequest).find(
    (context) => context.__typename === 'StatusContext' && context.context === GATE_CONTEXT
  );
  return gate ? { state: gate.state, description: gate.description || '', targetUrl: gate.targetUrl || '' } : undefined;
}

/**
 * Evaluate every check on the PR's head commit except our own gate (and any ignored contexts).
 * Returns 'ready' | 'pending' | 'failing'. A PR with no CI results at all is 'pending' — never
 * merge a PR nothing has checked.
 */
function evaluateChecks(pullRequest) {
  // an incomplete view of the checks must never grant the turn — treat as still-pending rather
  // than risk merging on unseen failures
  if (hasTruncatedCheckContexts(pullRequest)) {
    console.log(`  #${pullRequest.number}: more than 100 check contexts, treating as pending (raise the page size)`);
    return { state: 'pending', failing: [] };
  }
  const ignoredContexts = new Set(
    [GATE_CONTEXT]
      .concat((process.env.MERGE_QUEUE_IGNORE_CHECKS || '').split(','))
      .map((name) => name.trim())
      .filter(Boolean)
  );
  const failing = [];
  let pendingCount = 0;
  let evaluatedCount = 0;
  for (const context of getCheckContexts(pullRequest)) {
    if (context.__typename === 'StatusContext') {
      if (ignoredContexts.has(context.context)) continue;
      evaluatedCount += 1;
      if (context.state === 'SUCCESS') continue;
      if (context.state === 'FAILURE' || context.state === 'ERROR') failing.push(context.context);
      else pendingCount += 1; // PENDING / EXPECTED
    } else if (context.__typename === 'CheckRun') {
      if (ignoredContexts.has(context.name)) continue;
      evaluatedCount += 1;
      if (context.status !== 'COMPLETED') {
        pendingCount += 1;
        continue;
      }
      if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(context.conclusion)) continue;
      failing.push(context.name);
    }
  }
  if (failing.length) return { state: 'failing', failing };
  if (pendingCount || !evaluatedCount) return { state: 'pending', failing };
  return { state: 'ready', failing };
}

async function postGateStatus(pullRequest, state, description, targetUrl) {
  const current = getGateStatus(pullRequest);
  const trimmedDescription = description.slice(0, MAX_STATUS_DESCRIPTION_LENGTH);
  if (
    current &&
    current.state === state.toUpperCase() &&
    current.description === trimmedDescription &&
    current.targetUrl === (targetUrl || '')
  ) {
    return;
  }
  console.log(`  #${pullRequest.number}: ${GATE_CONTEXT} -> ${state} (${trimmedDescription})`);
  if (dryRun) return;
  await githubRequest('POST', `/repos/${OWNER}/${REPO}/statuses/${pullRequest.headRefOid}`, {
    state,
    context: GATE_CONTEXT,
    description: trimmedDescription,
    // the "Details" link on the PR's checks row opens the live dashboard
    ...(targetUrl ? { target_url: targetUrl } : {}),
  });
}

function describeQueueEntry({ entry, index, queueSize, winner, updateCandidate, masterState }) {
  const position = `position ${index + 1}/${queueSize}`;
  if (entry === winner) return { state: 'success', description: 'your turn — auto-merge will land this PR now' };
  const { pullRequest, checks } = entry;
  if (pullRequest.mergeable === 'CONFLICTING') {
    return { state: 'pending', description: `${position} — conflicts with master, resolve to become eligible` };
  }
  if (checks.state === 'failing') {
    const extra = checks.failing.length > 1 ? ` +${checks.failing.length - 1} more` : '';
    return {
      state: 'pending',
      description: `${position} — checks failing (${checks.failing[0]}${extra}), passed over until green`,
    };
  }
  if (entry === updateCandidate) {
    return { state: 'pending', description: `${position} — updating branch with master, checks will re-run` };
  }
  if (pullRequest.mergeStateStatus === 'BEHIND') {
    return {
      state: 'pending',
      description: masterState.settled
        ? `${position} — behind master, will be auto-updated on its turn`
        : `${position} — behind master, will be auto-updated once master settles (${masterState.reason})`,
    };
  }
  if (checks.state === 'pending') {
    return { state: 'pending', description: `${position} — waiting for checks to finish` };
  }
  if (!masterState.settled) {
    return { state: 'pending', description: `${position} — waiting for master (${masterState.reason})` };
  }
  if (winner) {
    return { state: 'pending', description: `${position} — waiting for #${winner.pullRequest.number} to land` };
  }
  return { state: 'pending', description: `${position} — waiting for turn` };
}

async function updateBranchWithMaster(pullRequest) {
  console.log(`updating #${pullRequest.number} branch with master (strict up-to-date protection)`);
  if (dryRun) return;
  try {
    // expected_head_sha makes this a compare-and-swap: if the author pushed since we looked, the
    // API rejects with 422 instead of updating a branch we haven't evaluated.
    await githubRequest('PUT', `/repos/${OWNER}/${REPO}/pulls/${pullRequest.number}/update-branch`, {
      expected_head_sha: pullRequest.headRefOid,
    });
  } catch (error) {
    // e.g. 422 (head moved) or 403 (fork branch without maintainer-edit permission) — log and let
    // the next cycle retry or a human update it; never fail the whole reconcile over one PR.
    console.log(`  failed to update #${pullRequest.number}: ${error.message}`);
  }
}

function escapeTableCell(text) {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function dashboardEntryState({ entry, winner, updateCandidate }) {
  const { pullRequest, checks } = entry;
  if (entry === winner) return '✅ merging now';
  if (pullRequest.mergeable === 'CONFLICTING') return '⚠️ conflicts with master';
  if (checks.state === 'failing') return `❌ failing: ${escapeTableCell(checks.failing.join(', '))}`;
  if (entry === updateCandidate) return '🔄 updating branch with master';
  if (pullRequest.mergeStateStatus === 'BEHIND') return '⏳ behind master, awaiting auto-update';
  if (checks.state === 'pending') return '⏳ checks running';
  return '🕐 waiting for turn';
}

// the timestamp line changes every run; strip it so we only PATCH the issue on real changes
function normalizeDashboardBody(body) {
  return (body || '')
    .split('\n')
    .filter((line) => !line.startsWith('_Last reconciled:'))
    .join('\n');
}

async function ensureDashboardLabel() {
  try {
    await githubRequest('GET', `/repos/${OWNER}/${REPO}/labels/${DASHBOARD_LABEL}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    await githubRequest('POST', `/repos/${OWNER}/${REPO}/labels`, {
      name: DASHBOARD_LABEL,
      color: '0e8a16',
      description: 'Managed by the merge-queue bot',
    });
  }
}

async function findDashboardIssue() {
  const issues = await githubRequest(
    'GET',
    `/repos/${OWNER}/${REPO}/issues?labels=${DASHBOARD_LABEL}&state=open&per_page=1`
  );
  return issues[0];
}

async function updateDashboard({ masterState, entries, winner, updateCandidate, dashboardIssue }) {
  const lines = [
    '<!-- managed by .github/scripts/merge-queue.js — manual edits will be overwritten -->',
    `_Last reconciled: ${new Date().toISOString()}_`,
    '',
    `**Master:** ${masterState.settled ? `🟢 settled — ${masterState.reason}` : `🟡 busy — ${masterState.reason}`}`,
    '',
  ];
  if (!entries.length) {
    lines.push('The queue is empty. Enable auto-merge (squash) on a PR to join.');
  } else {
    lines.push('| position | PR | author | state |');
    lines.push('| --- | --- | --- | --- |');
    entries.forEach((entry, index) => {
      const { pullRequest } = entry;
      const author = pullRequest.author?.login ?? 'unknown';
      lines.push(
        `| ${index + 1} | #${pullRequest.number} ${escapeTableCell(pullRequest.title)} | @${author} | ${dashboardEntryState({ entry, winner, updateCandidate })} |`
      );
    });
  }
  lines.push('', 'Queue order is the time auto-merge was enabled (first come, first served).');
  const body = lines.join('\n');

  if (!dashboardIssue) {
    console.log(`creating the merge-queue dashboard issue${dryRun ? ' (skipped: dry run)' : ''}`);
    if (dryRun) return;
    await ensureDashboardLabel();
    await githubRequest('POST', `/repos/${OWNER}/${REPO}/issues`, {
      title: DASHBOARD_TITLE,
      body,
      labels: [DASHBOARD_LABEL],
    });
    return;
  }
  if (normalizeDashboardBody(dashboardIssue.body) !== normalizeDashboardBody(body)) {
    console.log(
      `updating the merge-queue dashboard issue #${dashboardIssue.number}${dryRun ? ' (skipped: dry run)' : ''}`
    );
    if (dryRun) return;
    await githubRequest('PATCH', `/repos/${OWNER}/${REPO}/issues/${dashboardIssue.number}`, { body });
  }
}

async function main() {
  if (!githubToken) throw new Error('GITHUB_TOKEN is required');
  if (!circleToken) {
    throw new Error(
      'CIRCLE_TOKEN is required — a CircleCI API token, used to detect whether bit_merge is active on master. ' +
        'Without it the queue cannot tell when master is settled, so it refuses to run rather than merge blindly.'
    );
  }

  const masterState = await getMasterState();
  console.log(`master: ${masterState.settled ? 'settled' : 'busy'} — ${masterState.reason}`);

  // looked up before the status posts so the gate's "Details" link can point at the dashboard.
  // On the first run ever it doesn't exist yet — statuses go out without a link and self-heal
  // next cycle (the targetUrl comparison in postGateStatus re-posts them).
  const dashboardIssue = await findDashboardIssue();
  const dashboardUrl = dashboardIssue?.html_url;

  const openPullRequests = (await fetchOpenPullRequests()).filter(
    (pullRequest) => pullRequest.baseRefName === 'master'
  );
  const queuedPullRequests = openPullRequests
    .filter((pullRequest) => pullRequest.autoMergeRequest && !pullRequest.isDraft)
    .sort((a, b) => a.autoMergeRequest.enabledAt.localeCompare(b.autoMergeRequest.enabledAt) || a.number - b.number);
  const entries = queuedPullRequests.map((pullRequest) => ({ pullRequest, checks: evaluateChecks(pullRequest) }));
  console.log(`queue: ${entries.length} PR(s) — [${entries.map((e) => `#${e.pullRequest.number}`).join(', ')}]`);

  // fast mode: the first queued PR that is fully green, mergeable, and up to date takes the turn;
  // PRs ahead of it that are red/pending/conflicting/behind keep their position but are passed
  // over this round.
  const winner = masterState.settled
    ? entries.find(
        (entry) =>
          entry.checks.state === 'ready' &&
          entry.pullRequest.mergeable === 'MERGEABLE' &&
          entry.pullRequest.mergeStateStatus !== 'BEHIND'
      )
    : undefined;
  if (winner) console.log(`winner: #${winner.pullRequest.number} — flipping ${GATE_CONTEXT} to success`);

  // Master's strict up-to-date protection means a behind PR can never merge, and every bump
  // commit puts ALL open PRs behind — so when nothing can merge right now, press "Update branch"
  // on the first eligible behind PR. Skipped while a winner exists or bit_merge is running: the
  // update would be invalidated by the master commit that's about to land either way.
  const updateCandidate =
    masterState.settled && !winner
      ? entries.find(
          (entry) =>
            entry.pullRequest.mergeable === 'MERGEABLE' &&
            entry.checks.state !== 'failing' &&
            entry.pullRequest.mergeStateStatus === 'BEHIND'
        )
      : undefined;
  if (updateCandidate) await updateBranchWithMaster(updateCandidate.pullRequest);

  for (const [index, entry] of entries.entries()) {
    const { state, description } = describeQueueEntry({
      entry,
      index,
      queueSize: entries.length,
      winner,
      updateCandidate,
      masterState,
    });
    await postGateStatus(entry.pullRequest, state, description, dashboardUrl);
  }

  // A PR that left the queue (auto-merge disabled) with a stale `success` gate could be merged
  // manually at any moment, bypassing the queue. Reset it to pending.
  for (const pullRequest of openPullRequests) {
    if (queuedPullRequests.includes(pullRequest)) continue;
    if (getGateStatus(pullRequest)?.state === 'SUCCESS') {
      await postGateStatus(
        pullRequest,
        'pending',
        'not queued — enable auto-merge (squash) to join the merge queue',
        dashboardUrl
      );
    }
  }

  await updateDashboard({ masterState, entries, winner, updateCandidate, dashboardIssue });
  console.log('reconcile complete');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
