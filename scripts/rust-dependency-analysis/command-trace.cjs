// Opt-in benchmark instrumentation; never used by ordinary Bit commands.
const fs = require('node:fs');
const cp = require('node:child_process');
const target = process.env.BIT_RUST_DEPENDENCY_SCANNER;
const trace = {
  helperStarts: 0,
  maxConcurrentHelpers: 0,
  requests: 0,
  submittedFiles: 0,
  inlineFiles: 0,
  outcomes: {},
  helperPeakRssKiB: 0,
};
let activeHelpers = 0;
const spawn = cp.spawn;
cp.spawn = function (command, args, options) {
  const child = spawn.apply(this, arguments);
  if (!target || command !== target) return child;
  trace.helperStarts++;
  if (child.pid) {
    activeHelpers++;
    trace.maxConcurrentHelpers = Math.max(trace.maxConcurrentHelpers, activeHelpers);
    let active = true;
    const stopped = () => {
      if (active) {
        active = false;
        activeHelpers--;
      }
    };
    child.once('exit', stopped);
    child.once('error', stopped);
  }
  const write = child.stdin.write;
  child.stdin.write = function (buffer, ...rest) {
    try {
      const request = JSON.parse(buffer.toString());
      trace.requests++;
      trace.submittedFiles += request.files.length;
      trace.inlineFiles += request.files.filter((file) => file.source !== undefined).length;
    } catch {
      /* Count only complete protocol requests, without altering their transport. */
    }
    return write.call(this, buffer, ...rest);
  };
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
    let newline;
    while ((newline = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      try {
        const result = JSON.parse(line);
        for (const file of result.files || []) trace.outcomes[file.status] = (trace.outcomes[file.status] || 0) + 1;
      } catch {
        /* Production still validates all responses independently. */
      }
    }
    if (output.length > 8 * 1024 * 1024) output = '';
  });
  const kill = child.kill;
  child.kill = function (...parameters) {
    try {
      const status = fs.readFileSync(`/proc/${child.pid}/status`, 'utf8');
      trace.helperPeakRssKiB = Math.max(trace.helperPeakRssKiB, Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1] || 0));
    } catch {
      /* Helpers that already exited have no proc entry. */
    }
    return kill.apply(this, parameters);
  };
  return child;
};
process.on('exit', () => {
  const destination = process.env.BIT_COMMAND_BENCH_TRACE;
  if (destination)
    fs.writeFileSync(destination, JSON.stringify({ ...trace, nodePeakRssKiB: process.resourceUsage().maxRSS }));
});
