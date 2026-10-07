// Linux benchmark children are spawned detached, with their own process group.
function createBenchmarkProcessControl(child, options = {}) {
  const graceMs = options.graceMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 120000;
  let failure;
  let forced;
  let closed = false;
  function signal(name) {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  function terminate(reason) {
    if (closed || failure) return;
    failure = reason;
    signal('SIGTERM');
    forced = setTimeout(() => signal('SIGKILL'), graceMs);
  }
  const timeout = setTimeout(() => terminate(new Error('benchmark command timed out')), timeoutMs);
  function dispose() {
    closed = true;
    clearTimeout(timeout);
    clearTimeout(forced);
    child.removeListener('close', dispose);
    child.removeListener('error', dispose);
  }
  child.once('close', dispose);
  child.once('error', dispose);
  if (child.exitCode !== null || child.signalCode !== null) dispose();
  return {
    terminate,
    dispose,
    get failure() {
      return failure;
    },
  };
}

module.exports = { createBenchmarkProcessControl };
