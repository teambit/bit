/**
 * Regenerates scripts/e2e-test-timings.json — the per-file wall-clock estimates used by
 * scripts/split-e2e-tests.js to balance e2e files across CircleCI parallel nodes.
 *
 * How it works: mocha's junit reports don't capture before/after-hook time (where ~85% of our
 * e2e wall-clock goes), so per-file durations can't be read from any report directly. Instead,
 * this script derives them from data CircleCI does have:
 *   1. For each recent successful `e2e_test` job, every parallel node's total run time, and the
 *      exact list of files that ran on it (printed in the node's mocha command line).
 *   2. Each node is one equation: node_wall_time = fixed_overhead + sum(duration of its files).
 *      File-to-node assignments vary across jobs/branches, so collecting many jobs yields an
 *      overdetermined system, solved here with non-negative least squares (coordinate descent),
 *      lightly regularized toward a hook-count-based prior for files the data can't separate.
 *
 * Usage: node scripts/generate-e2e-timings.js
 * No auth token needed — the project is public on CircleCI. Run occasionally (e.g. monthly, or
 * when the predicted node loads from `split-e2e-tests.js --stats` drift from actual CI times).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(__dirname, 'e2e-test-timings.json');
const PROJECT = 'gh/teambit/bit';
const MAX_JOBS = 30;
const RIDGE_LAMBDA = 1; // weight of the prior relative to one node observation
const ITERATIONS = 300;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function findRecentE2eJobs() {
  const jobs = [];
  let pageToken;
  for (let page = 0; page < 4 && jobs.length < MAX_JOBS; page += 1) {
    const url = `https://circleci.com/api/v2/project/${PROJECT}/pipeline${pageToken ? `?page-token=${pageToken}` : ''}`;
    const data = await getJson(url);
    pageToken = data.next_page_token;
    for (const pipeline of data.items) {
      if (jobs.length >= MAX_JOBS) break;
      const workflows = (await getJson(`https://circleci.com/api/v2/pipeline/${pipeline.id}/workflow`)).items;
      for (const workflow of workflows.filter((w) => w.name === 'build_and_test')) {
        const wfJobs = (await getJson(`https://circleci.com/api/v2/workflow/${workflow.id}/job`)).items;
        const e2eJob = wfJobs.find((j) => j.name === 'e2e_test' && j.status === 'success' && j.job_number);
        if (e2eJob) jobs.push(e2eJob.job_number);
      }
    }
    if (!pageToken) break;
  }
  return jobs;
}

/** returns [{wall: seconds, files: [relative paths]}] - one entry per parallel node */
async function fetchNodeObservations(jobNumber) {
  const detail = await getJson(`https://circleci.com/api/v1.1/project/github/teambit/bit/${jobNumber}`);
  const step = (detail.steps || []).find((s) => s.name === 'Run e2e tests');
  if (!step) return [];
  const nodes = [];
  for (const action of step.actions) {
    if (action.status !== 'success' || !action.output_url) continue;
    try {
      const output = await getJson(action.output_url);
      const message = output[0].message.slice(0, 10000);
      const files = [
        ...new Set([...message.matchAll(/\/home\/circleci\/bit\/bit\/(e2e\/\S+?\.e2e\S*?\.ts)/g)].map((m) => m[1])),
      ];
      if (files.length) nodes.push({ wall: action.run_time_millis / 1000, files });
    } catch {
      // a node whose output expired or failed to parse just contributes no equation
    }
  }
  return nodes;
}

/** prior estimate per file from hook counts: hooks dominate e2e cost, ~12s per before-hook */
function buildPrior(file) {
  try {
    const src = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    const hooks = (src.match(/\bbefore(Each)?\s*\(/g) || []).length;
    return 20 + 12 * hooks;
  } catch {
    return 60; // file no longer exists locally; keep a neutral prior
  }
}

function solve(observations, files) {
  const fileIndex = new Map(files.map((f, i) => [f, i]));
  const prior = files.map(buildPrior);
  const estimate = [...prior];
  let fixed = 60;
  const obs = observations.map((o) => ({ idxs: o.files.map((f) => fileIndex.get(f)), wall: o.wall }));
  const occurrences = files.map(() => []);
  obs.forEach((o, oi) => o.idxs.forEach((i) => occurrences[i].push(oi)));

  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    const fileSums = obs.map((o) => o.idxs.reduce((sum, i) => sum + estimate[i], 0));
    fixed = Math.max(0, obs.reduce((acc, o, oi) => acc + o.wall - fileSums[oi], 0) / obs.length);
    const residuals = obs.map((o, oi) => o.wall - fixed - fileSums[oi]);
    for (let i = 0; i < files.length; i += 1) {
      if (!occurrences[i].length) continue;
      const numerator =
        occurrences[i].reduce((sum, oi) => sum + residuals[oi] + estimate[i], 0) + RIDGE_LAMBDA * prior[i];
      const updated = Math.max(0, numerator / (occurrences[i].length + RIDGE_LAMBDA));
      const delta = updated - estimate[i];
      if (delta) {
        occurrences[i].forEach((oi) => {
          residuals[oi] -= delta;
        });
        estimate[i] = updated;
      }
    }
  }

  const errors = obs.map((o) => {
    const predicted = fixed + o.idxs.reduce((sum, i) => sum + estimate[i], 0);
    return Math.abs(predicted - o.wall) / o.wall;
  });
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  return { estimate, fixed, meanError };
}

async function main() {
  console.error('finding recent successful e2e_test jobs...');
  const jobNumbers = await findRecentE2eJobs();
  console.error(`collecting node data from ${jobNumbers.length} jobs...`);
  const observations = [];
  for (const jobNumber of jobNumbers) {
    const nodes = await fetchNodeObservations(jobNumber);
    observations.push(...nodes);
    console.error(`  job ${jobNumber}: ${nodes.length} nodes`);
  }
  if (observations.length < 50) {
    throw new Error(`only ${observations.length} node observations collected - not enough to solve reliably`);
  }
  const files = [...new Set(observations.flatMap((o) => o.files))].sort();
  console.error(`solving for ${files.length} files from ${observations.length} node observations...`);
  const { estimate, fixed, meanError } = solve(observations, files);
  console.error(
    `fixed per-node overhead: ${Math.round(fixed)}s, mean node prediction error: ${(meanError * 100).toFixed(1)}%`
  );
  if (meanError > 0.15) {
    console.error('warning: prediction error is high; estimates may be stale or assignments lacked diversity');
  }

  // floor at 15s: the solver can collapse under-identified files to 0, which makes the
  // bin-packer treat them as free and pile dozens of them onto one node
  const manifest = Object.fromEntries(files.map((f, i) => [f, Math.max(15, Math.round(estimate[i]))]));
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
