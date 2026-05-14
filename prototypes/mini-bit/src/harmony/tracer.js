// Lightweight tracing so we can see exactly what got loaded for each command.
// Enable with BIT_TRACE_ASPECT_LOAD=1
const enabled = process.env.BIT_TRACE_ASPECT_LOAD === '1';
const events = [];
const t0 = Date.now();

export function trace(event) {
  const dt = Date.now() - t0;
  events.push({ event, t: dt });
  if (enabled) process.stderr.write(`[trace +${dt}ms] ${event}\n`);
}

export function getEvents() { return events; }

export function summarize(totalMs) {
  const loads = events.filter((e) => e.event.startsWith('load '));
  process.stderr.write(
    `\n--- ${loads.length} aspect runtime(s) loaded in ${totalMs}ms ---\n`
  );
  for (const e of loads) process.stderr.write(`  ${e.event}\n`);
}
