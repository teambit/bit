// Linux-only benchmark instrumentation. RSS sums count shared pages in each process.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

function createProcessTreeMemorySampler(rootPid, options = {}) {
  if (!Number.isSafeInteger(rootPid) || rootPid < 1) throw new Error('root PID must be a positive integer');
  const intervalMs = options.intervalMs ?? 20;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 5 || intervalMs > 1000)
    throw new Error('sampling interval must be an integer from 5 to 1000 ms');
  const procRoot = options.procRoot || '/proc';
  const readFileSync = options.readFileSync || fs.readFileSync;
  const clock = options.clock || (() => performance.now());
  const started = clock();
  const known = new Map();
  const identities = new Set();
  const report = {
    method: 'near-simultaneous sampled sum of Linux /proc VmRSS for the command process and observed descendants',
    sampleIntervalMs: intervalMs,
    samples: 0,
    peakSampledRssKiB: 0,
    peakProcesses: [],
    maxConcurrentProcesses: 0,
    uniqueProcesses: 0,
    missingProcessReads: 0,
    failedProcReads: 0,
    racedProcessReads: 0,
    observedRootExit: false,
    measurementSpanMs: 0,
    maxSampleGapMs: 0,
    maxSampleDurationMs: 0,
    samplerCpuMs: 0,
  };
  function read(filename) {
    try {
      return readFileSync(filename, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ESRCH') report.missingProcessReads++;
      else report.failedProcReads++;
      return undefined;
    }
  }
  function processInfo(pid) {
    const stat = read(path.join(procRoot, String(pid), 'stat'));
    if (!stat) return undefined;
    const end = stat.lastIndexOf(')');
    const fields = stat
      .slice(end + 2)
      .trim()
      .split(/\s+/);
    const status = read(path.join(procRoot, String(pid), 'status'));
    if (status === undefined) return undefined;
    if (end < 0 || fields.length < 20) {
      report.failedProcReads++;
      return undefined;
    }
    const verifiedStat = read(path.join(procRoot, String(pid), 'stat'));
    if (!verifiedStat) return undefined;
    const verifiedFields = verifiedStat
      .slice(verifiedStat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/);
    if (
      verifiedStat.lastIndexOf(')') < 0 ||
      verifiedFields.length < 20 ||
      Number(stat.slice(0, stat.indexOf(' '))) !== pid ||
      Number(verifiedStat.slice(0, verifiedStat.indexOf(' '))) !== pid
    ) {
      report.failedProcReads++;
      return undefined;
    }
    if (fields[19] !== verifiedFields[19]) {
      report.racedProcessReads++;
      return undefined;
    }
    const rss = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    if (!rss && fields[0] !== 'Z' && !/^State:\s+Z\b/m.test(status)) {
      report.failedProcReads++;
      return undefined;
    }
    return {
      pid,
      command: stat.slice(stat.indexOf('(') + 1, end),
      parentPid: Number(fields[1]),
      startTime: fields[19],
      rssKiB: rss ? Number(rss[1]) : 0,
    };
  }
  const root = processInfo(rootPid);
  if (!root) throw new Error('cannot inspect command process in procfs');
  // Descendants are discovered only through task children lists. Kernels without
  // CONFIG_PROC_CHILDREN lack them, which would silently measure the root process alone.
  try {
    readFileSync(path.join(procRoot, String(rootPid), 'task', String(rootPid), 'children'), 'utf8');
  } catch (error) {
    throw new Error(`procfs task children lists are unavailable (CONFIG_PROC_CHILDREN): ${error.code}`);
  }
  known.set(rootPid, root.startTime);
  identities.add(`${rootPid}:${root.startTime}`);

  let previousSample = started;
  function sample() {
    const sampleStarted = clock();
    const cpuStarted = process.cpuUsage();
    report.maxSampleGapMs = Math.max(report.maxSampleGapMs, sampleStarted - previousSample);
    previousSample = sampleStarted;
    const processes = new Map();
    const queue = [];
    // Retain previously observed descendants after their parent exits. A reused
    // PID has a different start time and cannot join the measured process tree.
    for (const [pid, startTime] of known) {
      const info = processInfo(pid);
      if (!info || info.startTime !== startTime) {
        known.delete(pid);
        if (pid === rootPid) report.observedRootExit = true;
      } else {
        processes.set(pid, info);
        queue.push(info);
      }
    }
    for (let index = 0; index < queue.length; index++) {
      const parent = queue[index];
      const tasks = path.join(procRoot, String(parent.pid), 'task');
      let threads;
      try {
        threads = fs.readdirSync(tasks);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ESRCH') report.missingProcessReads++;
        else report.failedProcReads++;
        continue;
      }
      for (const thread of threads) {
        const children = read(path.join(tasks, thread, 'children'));
        if (!children) continue;
        for (const value of children.trim().split(/\s+/)) {
          const pid = Number(value);
          if (!Number.isSafeInteger(pid) || pid < 1 || processes.has(pid)) continue;
          const child = processInfo(pid);
          if (!child || child.parentPid !== parent.pid) continue;
          known.set(pid, child.startTime);
          identities.add(`${pid}:${child.startTime}`);
          processes.set(pid, child);
          queue.push(child);
        }
      }
    }
    const rssKiB = [...processes.values()].reduce((total, info) => total + info.rssKiB, 0);
    if (rssKiB > report.peakSampledRssKiB) {
      report.peakSampledRssKiB = rssKiB;
      report.peakProcesses = [...processes.values()].map(({ parentPid, ...info }) => info);
    }
    report.samples++;
    report.uniqueProcesses = identities.size;
    report.maxConcurrentProcesses = Math.max(report.maxConcurrentProcesses, processes.size);
    report.measurementSpanMs = clock() - started;
    report.maxSampleDurationMs = Math.max(report.maxSampleDurationMs, clock() - sampleStarted);
    const cpu = process.cpuUsage(cpuStarted);
    report.samplerCpuMs += (cpu.user + cpu.system) / 1000;
  }
  sample();
  let timer;
  let stopped = false;
  return {
    sample,
    start() {
      if (stopped) throw new Error('sampler is stopped');
      if (!timer) timer = setInterval(sample, intervalMs);
    },
    stop() {
      if (!stopped) {
        clearInterval(timer);
        sample();
        stopped = true;
      }
      return JSON.parse(JSON.stringify(report));
    },
  };
}

module.exports = { createProcessTreeMemorySampler };
