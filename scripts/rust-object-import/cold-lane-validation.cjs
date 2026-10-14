const assert = require('node:assert/strict');

function validateColdLane(trace, scenario) {
  assert.notEqual(scenario.target, 'component', 'cold lane proof requires a lane command');
  const frames = trace.workspaceFrames || [];
  const commands = frames.filter((frame) => frame.magic === 'BWS1' && String(frame.kind).startsWith('command'));
  const names = commands.map((frame) => frame.kind);
  assert.equal(trace.workspace?.commandApply?.applied, 1, `${scenario.name}: cold lane publication required`);
  assert.deepEqual(names.slice(0, 2), ['commandPrepare', 'commandPlan']);
  assert.equal(names.at(-1), 'commandApply');
  assert.equal(names.filter((name) => name === 'commandLaneFinalize').length, 1, 'one retained lane finalization');
  assert.equal(new Set(names).size, names.length, 'no repeated command phases');
  const order = [
    'commandPrepare',
    'commandPlan',
    'commandPolicyPrepare',
    'commandDependencyDetect',
    'commandDependencyComplete',
    'commandLaneFinalize',
    'commandFinalize',
    'commandApply',
  ];
  let previous = -1;
  for (const name of names) {
    const position = order.indexOf(name);
    assert.ok(position > previous, `unexpected lane command phase ${name}`);
    previous = position;
  }
  const owner = commands[0]?.helperId;
  assert.notEqual(owner, undefined, 'physical lane owner');
  assert.ok(
    frames.every((frame) => frame.helperId === owner),
    'lane command replaced its owner'
  );
  for (const frame of commands) {
    assert.equal(frame.receipt?.failed, false, `${frame.kind}: failed receipt`);
    assert.ok(
      frame.receipt.completed > 0 || (frame.kind === 'commandFinalize' && frame.receipt.snapped > 0),
      `${frame.kind}: completed effect or scope-only snapshot receipt required`
    );
    assert.equal(trace.workspace[frame.kind]?.failed, 0, `${frame.kind}: failed metric`);
  }
  assert.equal(commands.at(-1).receipt.applied, true, 'accepted lane publication receipt');
  for (const metric of Object.values(trace.workspace))
    assert.equal(metric.sourceBodyBytes ?? 0, 0, 'lane command transported Source bodies');
  assert.deepEqual(trace.loadedCommandModels, [], 'cold lane command loaded legacy model classes');
}
function validateColdLaneFallback(trace, scenario) {
  assert.ok(
    scenario.fault ||
      scenario.error ||
      scenario.canonicalError ||
      scenario.promptCancellation ||
      scenario.canonicalFallback,
    'only explicit canonical error or legacy fault routes may fall back'
  );
  if (scenario.canonicalFallback) {
    assert.equal(scenario.untimed, true, 'unsupported canonical route cannot be timed as native');
    assert.equal(typeof scenario.canonicalFallback, 'string', 'explicit unsupported reason required');
    assert.ok(scenario.canonicalFallback.length > 0);
  }
  const commands = (trace.workspaceFrames || []).filter(
    (frame) => frame.magic === 'BWS1' && String(frame.kind).startsWith('command')
  );
  const allowed = new Set([
    'commandPrepare',
    'commandPlan',
    'commandPolicyPrepare',
    'commandDependencyDetect',
    'commandDependencyComplete',
  ]);
  assert.ok(
    commands.every((frame) => allowed.has(frame.kind)),
    'fallback cannot publish or finalize a cold command'
  );
  assert.equal(trace.workspace?.commandApply?.frames || 0, 0, 'fallback cannot attempt cold publication');
  assert.equal(trace.workspace?.commandApply?.applied || 0, 0, 'fallback cannot accept cold publication');
  if (scenario.fault) assert.equal(commands.length, 0, 'legacy fault must bypass cold entry entirely');
  assert.ok(trace.loadedCommandModels?.length > 0, 'fallback must run canonical command classes');
  for (const metric of Object.values(trace.workspace || {}))
    assert.equal(metric.sourceBodyBytes ?? 0, 0, 'fallback must not bridge Source bodies');
}
module.exports = { validateColdLane, validateColdLaneFallback };
