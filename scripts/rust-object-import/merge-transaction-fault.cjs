// Diagnostic-only transport fault after the helper has acknowledged an actual operation.
// No class/model/FS defaults are replaced; the ordinary Node run remains unchanged.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const cli = process.env.BIT_MERGE_TRANSACTION_FAULT_CLI;
const output = process.env.BIT_MERGE_TRANSACTION_FAULT_REPORT;
if (!cli || !output) throw new Error('owned private CLI and outside-workspace fault report required');
const installed = createRequire(path.join(cli, 'package.json'));
const { MaterializationSession } = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
const original = MaterializationSession.prototype.request;
let fired = false;
MaterializationSession.prototype.request = function (build, count, validate, ...options) {
  let input;
  const captured = (id) => {
    const frame = build(id);
    if (frame.subarray(0, 4).toString() === 'BMT1') input = JSON.parse(frame.subarray(12));
    return frame;
  };
  return original.call(
    this,
    captured,
    count,
    (response) => {
      const target =
        !fired &&
        input?.kind === process.env.BIT_MERGE_TRANSACTION_FAULT_KIND &&
        (!process.env.BIT_MERGE_TRANSACTION_FAULT_PHASE ||
          input.phase === process.env.BIT_MERGE_TRANSACTION_FAULT_PHASE);
      if (target && response.completed === 1 && !response.failed) {
        fired = true;
        fs.writeFileSync(
          output,
          JSON.stringify({
            kind: input.kind,
            phase: input.phase,
            token: input.token,
            revision: input.revision,
            acknowledgedByHelper: true,
            discardedBeforeAdapterReceipt: true,
          })
        );
        return false; // The real session retires on a missing/invalid client receipt.
      }
      return validate ? validate(response) : true;
    },
    ...options
  );
};
