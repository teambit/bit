// Proof-only child instrumentation; it does not replace extraction or transport.
const fs = require('node:fs');
const cp = require('node:child_process');
process.env.BIT_PACKAGED_TRACE_OWNER ??= String(process.pid);
const owner = process.env.BIT_PACKAGED_TRACE_OWNER === String(process.pid);
const trace = { helperStarts: 0, requests: 0, submittedFiles: 0, outcomes: {} };
const spawn = cp.spawn;
cp.spawn = function (command, ...args) {
  const child = spawn.call(this, command, ...args);
  if (command !== process.env.BIT_PACKAGED_EXPECTED_EXECUTABLE) return child;
  trace.helperStarts++;
  const write = child.stdin.write;
  child.stdin.write = function (buffer, ...parameters) {
    try {
      const request = JSON.parse(buffer.toString());
      trace.requests++;
      trace.submittedFiles += request.files.length;
    } catch {}
    return write.call(this, buffer, ...parameters);
  };
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
    let newline;
    while ((newline = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      try {
        for (const file of JSON.parse(line).files || [])
          trace.outcomes[file.status] = (trace.outcomes[file.status] || 0) + 1;
      } catch {}
    }
    if (output.length > 8 * 1024 * 1024) output = '';
  });
  return child;
};
process.on('exit', () => {
  if (owner && process.env.BIT_PACKAGED_TRACE) fs.writeFileSync(process.env.BIT_PACKAGED_TRACE, JSON.stringify(trace));
});
