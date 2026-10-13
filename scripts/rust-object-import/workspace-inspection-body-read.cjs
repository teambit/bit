// Linux-only external observation: public JavaScript method identities remain untouched.
const fs = require('node:fs/promises');
const path = require('node:path');
function summarize(text, sourcePaths) {
  const pending = new Map(),
    lines = [];
  for (const raw of text.split('\n')) {
    const unfinished = raw.match(/^\s*(\d+)\s+(.*)<unfinished \.\.\.>$/);
    if (unfinished) {
      pending.set(unfinished[1], unfinished[2]);
      continue;
    }
    const resumed = raw.match(/^\s*(\d+)\s+<\.\.\. \w+ resumed>(.*)$/);
    if (resumed && pending.has(resumed[1])) {
      lines.push(`${resumed[1]} ${pending.get(resumed[1])}${resumed[2]}`);
      pending.delete(resumed[1]);
    } else lines.push(raw);
  }
  const threads = new Set(),
    reads = [];
  const first = lines.find((line) => /^\s*\d+\s+execve\(/.test(line));
  if (!first) throw new Error('strace did not record the main Node exec');
  const nodePid = Number(first.match(/^\s*(\d+)/)[1]);
  threads.add(nodePid);
  const links = [];
  for (const line of lines) {
    const clone = line.match(/^\s*(\d+)\s+clone(?:3)?\(.*CLONE_THREAD.*\)\s+=\s+(\d+)/);
    if (clone) links.push([Number(clone[1]), Number(clone[2])]);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [parent, child] of links)
      if (threads.has(parent) && !threads.has(child)) {
        threads.add(child);
        changed = true;
      }
  }
  const sourceSet = new Set(sourcePaths.map((filename) => path.posix.resolve(filename)));
  const rustThreads = new Set();
  const rustReads = [];
  for (const line of lines) {
    const named = line.match(/^\s*(\d+)\s+prctl\(PR_SET_NAME, "([^"]+)"\s*\)\s+=\s+0$/);
    if (named && threads.has(Number(named[1]))) {
      if (/^bit-vcs-[0-7]$/.test(named[2])) rustThreads.add(Number(named[1]));
      else rustThreads.delete(Number(named[1]));
    }
    const read = line.match(/^\s*(\d+)\s+(?:read|pread64)\(\d+<([^>]+)>\s*,.*\)\s+=\s+(\d+)/);
    if (!read || !threads.has(Number(read[1])) || Number(read[3]) === 0) continue;
    const filename = read[2].replace(/ \(deleted\)$/, '');
    const snapshot = /\/bit-workspace-inspection-[^/]+\//.test(filename);
    if (sourceSet.has(filename) || snapshot)
      (rustThreads.has(Number(read[1])) ? rustReads : reads).push({
        thread: Number(read[1]),
        path: filename,
        bytes: Number(read[3]),
        kind: snapshot ? 'snapshot' : 'source',
      });
  }
  return {
    nodePid, threads: [...threads], rustThreads: [...rustThreads], reads, rustReads,
    bytes: reads.reduce((sum, read) => sum + read.bytes, 0),
    rustBytes: rustReads.reduce((sum, read) => sum + read.bytes, 0),
  };
}
async function observe(filename, sourcePaths) {
  return summarize(await fs.readFile(filename, 'utf8'), sourcePaths);
}
module.exports = { summarize, observe };
