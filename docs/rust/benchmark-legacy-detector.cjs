// Extraction microbenchmark; does not execute precinct, resolution, or a Bit command.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const root = path.resolve(process.argv[2] || '.');
const modulesRoot = path.resolve(process.argv[3] || root);
const detectorPath = path.join(modulesRoot, 'node_modules/@teambit/typescript.deps-detectors.detective-typescript');
const detective = require(detectorPath).default;
const detectorRequire = createRequire(fs.realpathSync(path.join(detectorPath, 'package.json')));
const packageVersions = Object.fromEntries(['@teambit/typescript.deps-detectors.detective-typescript', '@typescript-eslint/typescript-estree', 'node-source-walk'].map(name => [name, detectorRequire(`${name}/package.json`).version]));
const files = execFileSync('git', ['ls-files', 'scopes/dependencies', 'scopes/workspace'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(f => /\.tsx?$/.test(f)).sort().slice(0, 120);
let bytes = 0;
for (const file of files) bytes += fs.statSync(path.join(root, file)).size;
function run() {
  let dependencies = 0, failures = 0;
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    try { dependencies += Object.keys(detective(source, { jsx: file.endsWith('.tsx') })).length; }
    catch (error) { failures++; if (failures === 1) console.error(error.message); }
  }
  const cpu = process.cpuUsage(cpuStart);
  return { elapsedMs: +(performance.now() - start).toFixed(3), cpuMs: +((cpu.user + cpu.system) / 1000).toFixed(3), dependencies, failures };
}
run();
const runs = Array.from({ length: 9 }, run);
console.log(JSON.stringify({ packageVersions, node: process.version, platform: `${process.platform}/${process.arch}`, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), files, bytes, runs, peakRssKiB: process.resourceUsage().maxRSS, medianElapsedMs: runs.map(r => r.elapsedMs).sort((a,b) => a-b)[4] }, null, 2));

if (runs.some(run => run.failures)) process.exitCode = 1;
