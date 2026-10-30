/**
 * Regenerates scripts/e2e-test-timings.json — the per-file wall-clock estimates used by
 * scripts/split-e2e-tests.js to balance e2e files across CircleCI parallel nodes.
 *
 * How it works: mocha's junit reports don't attribute before/after-hook time (where ~85% of our
 * e2e wall-clock goes) to any testcase, but each <testsuite> carries a `timestamp` and a `file`
 * attribute. Within a node, files run sequentially, so the gap between the first suite timestamp
 * of one file and the first suite timestamp of the next file IS that file's full wall time,
 * hooks included (the last file on a node is closed by the <testsuites> root timestamp + total
 * time). This measures every file directly — no equation solving, no cross-file attribution
 * ambiguity. Per-file times are aggregated as the median across the sampled jobs.
 *
 * Usage: node scripts/generate-e2e-timings.js [--jobs=N]
 *   --jobs=N   how many recent successful e2e_test jobs to sample (default 6). Times are stable
 *              run-to-run (spread typically <90s), so a small window of recent runs is enough
 *              and keeps estimates current after suite or product changes.
 * Files with no junit observation (brand-new tests) keep their existing manifest entry if any;
 * otherwise the splitter assigns them the manifest median at pack time.
 * No auth token needed — the project and its artifacts are public on CircleCI.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(__dirname, 'e2e-test-timings.json');
const PROJECT = 'gh/teambit/bit';
const cliFlag = (name, def) => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : def;
};
const MAX_JOBS = parseInt(cliFlag('jobs', '6'), 10);
const MIN_FILE_SECONDS = 15;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
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

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

/** returns {relativeFilePath: seconds} for one node's junit XML */
function perFileTimesFromJunit(xml) {
  const rootTag = xml.match(/<testsuites\b[^>]*>/);
  if (!rootTag) return {};
  const totalSeconds = parseFloat(parseAttrs(rootTag[0]).time || '0');
  let rootStart = null;
  const suiteStarts = []; // [{start: Date, file: relative path}]
  for (const m of xml.matchAll(/<testsuite\b[^>]*>/g)) {
    const attrs = parseAttrs(m[0]);
    if (!attrs.timestamp) continue;
    const start = new Date(`${attrs.timestamp}Z`);
    if (attrs.name === 'Root Suite') {
      rootStart = start;
      continue;
    }
    if (!attrs.file) continue;
    const rel = attrs.file.replace(/^.*?\/bit\/bit\//, '');
    suiteStarts.push({ start, file: rel });
  }
  if (!suiteStarts.length || !rootStart) return {};
  suiteStarts.sort((a, b) => a.start - b.start);
  // first suite timestamp per file, preserving execution order
  const fileStarts = [];
  const seen = new Set();
  for (const { start, file } of suiteStarts) {
    if (seen.has(file)) continue;
    seen.add(file);
    fileStarts.push({ start, file });
  }
  const nodeEnd = new Date(rootStart.getTime() + totalSeconds * 1000);
  const times = {};
  fileStarts.forEach(({ start, file }, i) => {
    const end = i + 1 < fileStarts.length ? fileStarts[i + 1].start : nodeEnd;
    const seconds = (end - start) / 1000;
    if (seconds > 0) times[file] = seconds;
  });
  return times;
}

async function collectJobObservations(jobNumber, observations) {
  const artifacts = await getJson(`https://circleci.com/api/v1.1/project/github/teambit/bit/${jobNumber}/artifacts`);
  const junitArtifacts = artifacts.filter((a) => a.path && a.path.includes('junit'));
  let nodes = 0;
  for (const artifact of junitArtifacts) {
    try {
      const times = perFileTimesFromJunit(await getText(artifact.url));
      if (!Object.keys(times).length) continue;
      nodes += 1;
      for (const [file, seconds] of Object.entries(times)) {
        (observations[file] ??= []).push(seconds);
      }
    } catch {
      // a node whose artifact expired or failed to parse just contributes no observation
    }
  }
  return nodes;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  console.error('finding recent successful e2e_test jobs...');
  const jobNumbers = await findRecentE2eJobs();
  console.error(`collecting junit timings from ${jobNumbers.length} jobs...`);
  const observations = {};
  for (const jobNumber of jobNumbers) {
    const nodes = await collectJobObservations(jobNumber, observations);
    console.error(`  job ${jobNumber}: ${nodes} nodes with junit data`);
  }
  const measuredFiles = Object.keys(observations).length;
  if (measuredFiles < 100) {
    throw new Error(`only ${measuredFiles} files measured - junit artifacts may be missing or expired`);
  }

  const existingManifest = (() => {
    try {
      return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch {
      return {};
    }
  })();

  // start from the existing manifest (covers brand-new files with no junit data yet),
  // overwrite with measured medians, and drop files that no longer exist locally.
  const manifest = {};
  for (const [file, seconds] of Object.entries(existingManifest)) manifest[file] = seconds;
  for (const [file, samples] of Object.entries(observations)) {
    manifest[file] = Math.max(MIN_FILE_SECONDS, Math.round(median(samples)));
  }
  const finalManifest = Object.fromEntries(
    Object.entries(manifest)
      .filter(([file]) => fs.existsSync(path.join(REPO_ROOT, file)))
      .sort(([a], [b]) => a.localeCompare(b))
  );
  const total = Object.values(finalManifest).reduce((a, b) => a + b, 0);
  console.error(
    `measured ${measuredFiles} files; manifest has ${Object.keys(finalManifest).length} (total ${Math.round(total / 60)} machine-minutes)`
  );
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(finalManifest, null, 2)}\n`);
  console.error(`wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
