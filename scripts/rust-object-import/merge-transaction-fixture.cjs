const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const checkout = require('./checkout-transition-fixture.cjs');
const history = require('./history-query-fixture.cjs');

// Every topology is built by public disposable lane/snap commands after genuine import.
const scenarios = [
  {
    name: 'lane-clean-squash-message',
    coldOnly: true,
    target: 'lane',
    topology: 'clean',
    squash: true,
    message: 'explicit lane squash title',
    untimed: true,
  },
  {
    name: 'lane-clean-no-snap-message',
    coldOnly: true,
    target: 'lane',
    topology: 'clean',
    noSnap: true,
    message: 'deferred lane merge title',
    untimed: true,
  },
  { name: 'lane-new-component', coldOnly: true, target: 'lane', topology: 'addition', untimed: true },
  { name: 'main-new-component', coldOnly: true, target: 'main', topology: 'addition', untimed: true },
  {
    name: 'lane-new-component-no-auto-snap',
    coldOnly: true,
    target: 'lane',
    topology: 'addition',
    noAutoSnap: true,
    untimed: true,
  },
  { name: 'lane-inactive-component', coldOnly: true, target: 'lane', topology: 'inactive-addition', untimed: true },
  { name: 'main-inactive-component', coldOnly: true, target: 'main', topology: 'inactive-addition', untimed: true },
  { name: 'lane-delete-diverged', target: 'lane', topology: 'delete-diverged', untimed: true },
  {
    name: 'lane-delete-conflict-theirs',
    target: 'lane',
    topology: 'delete-conflict',
    strategy: 'theirs',
    untimed: true,
  },
  {
    name: 'main-dependency-candidates',
    target: 'main',
    topology: 'dependency-main-only',
    pattern: true,
    includeDeps: true,
    candidatesRequired: true,
    untimed: true,
  },
  {
    name: 'main-dependency-included',
    target: 'main',
    topology: 'dependency',
    pattern: true,
    includeDeps: true,
    untimed: true,
  },
  {
    name: 'lane-unrelated-error',
    target: 'main-into-lane',
    topology: 'unrelated',
    unrelated: true,
    error: true,
    untimed: true,
  },
  {
    name: 'lane-unrelated-ours',
    target: 'main-into-lane',
    topology: 'unrelated',
    unrelated: true,
    resolveUnrelated: 'ours',
    canonicalFallback: 'unrelated-history resolution remains canonical',
    untimed: true,
  },
  {
    name: 'lane-unrelated-theirs',
    target: 'main-into-lane',
    topology: 'unrelated',
    unrelated: true,
    resolveUnrelated: 'theirs',
    canonicalFallback: 'unrelated-history resolution remains canonical',
    untimed: true,
  },
  { name: 'lane-clean-no-auto-snap', target: 'lane', topology: 'clean', noAutoSnap: true, untimed: true },
  { name: 'main-clean-no-squash', target: 'main', topology: 'clean', noSquash: true, untimed: true },
  {
    name: 'main-clean-detach-head',
    target: 'main',
    topology: 'clean',
    detachHead: true,
    untimed: true,
    canonicalFallback: 'detach-head remains canonical',
  },
  { name: 'lane-fast-forward-no-snap', target: 'lane', topology: 'fast-forward', noSnap: true, untimed: true },
  { name: 'lane-built-artifacts', target: 'lane', topology: 'clean', built: true, untimed: true },
  {
    name: 'lane-lost-results-policy',
    target: 'lane',
    topology: 'clean',
    untimed: true,
    fault: { kind: 'mergeResultsSelect' },
  },
  {
    name: 'lane-lost-pending-write-receipt',
    target: 'lane',
    topology: 'clean',
    untimed: true,
    fault: { kind: 'mergeTransactionReceipt', phase: 'pendingWrite' },
  },
  {
    name: 'lane-lost-snap-receipt',
    target: 'lane',
    topology: 'clean',
    untimed: true,
    fault: { kind: 'mergeTransactionReceipt', phase: 'snap' },
  },
  { name: 'hidden-main-into-lane', hidden: true, untimed: true, target: 'main-into-lane', topology: 'hidden' },
  { name: 'main-into-lane-clean', target: 'main-into-lane', topology: 'clean' },
  { name: 'component-main-ours', target: 'component', topology: 'conflict', strategy: 'ours' },
  { name: 'component-main-theirs', target: 'component', topology: 'conflict', strategy: 'theirs' },
  { name: 'component-main-manual', target: 'component', topology: 'conflict', strategy: 'manual' },
  { name: 'component-main-default-cancel', target: 'component', topology: 'conflict', promptCancellation: true },
  { name: 'main-fast-forward', target: 'main', topology: 'fast-forward' },
  { name: 'lane-fast-forward', target: 'lane', topology: 'fast-forward' },
  { name: 'main-clean-diverge', target: 'main', topology: 'clean' },
  { name: 'lane-clean-diverge', target: 'lane', topology: 'clean' },
  { name: 'main-conflict-ours', target: 'main', topology: 'conflict', strategy: 'ours' },
  { name: 'lane-conflict-theirs', target: 'lane', topology: 'conflict', strategy: 'theirs' },
  { name: 'lane-manual-abort', target: 'lane', topology: 'conflict', strategy: 'manual', untimed: true, abort: true },
  { name: 'lane-conflict-manual', target: 'lane', topology: 'conflict', strategy: 'manual' },
  { name: 'lane-conflict-default-cancel', target: 'lane', topology: 'conflict', promptCancellation: true },
  { name: 'lane-binary-theirs', target: 'lane', topology: 'binary', strategy: 'theirs' },
  { name: 'main-deletion', target: 'main', topology: 'deletion' },
  { name: 'lane-config-incoming', target: 'lane', topology: 'config', strategy: 'theirs' },
  { name: 'lane-bom-crlf', target: 'lane', topology: 'eol' },
  { name: 'lane-dependency-required-error', target: 'lane', topology: 'dependency', pattern: true, error: true },
  { name: 'lane-dependency-included', target: 'lane', topology: 'dependency', pattern: true, includeDeps: true },
];
const base =
  'import dependency from "@qualification/checkout.dependency";\nexport const first = "base";\nexport const middle = 1;\nexport const last = "base";\nexport { dependency };\n';
const snapArgs = (ids, message) => [
  'snap',
  ids.length > 1 ? '*' : ids[0],
  '--message',
  message,
  '--skip-auto-snap',
  '--disable-snap-pipeline',
  '--ignore-issues',
  '*',
];

async function prepareScenario(directory, scenario, roots, fixture, command, cli) {
  if (scenario.unrelated)
    return require('./merge-transaction-unrelated-fixture.cjs').prepareUnrelated({
      directory,
      roots,
      fixture,
      command,
    });
  if (scenario.hidden)
    return require('./merge-transaction-hidden-fixture.cjs').prepareHiddenMainMerge({
      cli,
      directory,
      roots,
      fixture,
      command,
      runApi: (cwd, runner, args) => command(cwd, ['__api', runner, ...args], 'node'),
    });
  const root = roots.root;
  assert.ok(root && fixture.id && fixture.dependencyId);
  const run = async (args) => {
    const result = await command(directory, args, 'node');
    assert.equal(result.code, 0, result.stderr || result.stdout);
    return result;
  };
  if (scenario.target === 'component') {
    await run(['checkout', '1.0.0', fixture.id, '--skip-dependency-installation']);
    await fs.writeFile(path.join(root, 'index.js'), 'export default "local main divergence";\n');
    await run([
      'tag',
      fixture.id,
      '--ver',
      '2.0.0',
      '--ignore-newest-version',
      '--skip-auto-tag',
      '--disable-tag-pipeline',
      '--ignore-issues',
      '*',
      '--message',
      'merge transaction local main',
    ]);
    await run(['import', fixture.id, '--objects', '--all-history', '--skip-dependency-installation']);
    return;
  }
  await fs.writeFile(path.join(root, 'index.js'), base);
  await run(snapArgs([fixture.id], 'merge transaction common base'));
  if (scenario.target === 'main-into-lane') {
    await run(['lane', 'create', 'destination', '--scope', 'qualification.destination']);
    await fs.writeFile(path.join(root, 'index.js'), base.replace('first = "base"', 'first = "local"'));
    await run(snapArgs([fixture.id], 'merge transaction destination'));
    await run(['switch', 'main', '--skip-fetch', '--skip-dependency-installation']);
    await fs.writeFile(path.join(root, 'index.js'), base.replace('last = "base"', 'last = "incoming"'));
    await run(snapArgs([fixture.id], 'merge transaction incoming main'));
    await run(['export']);
    await run(['switch', 'destination', '--skip-fetch', '--skip-dependency-installation']);
    return;
  }

  if (scenario.topology === 'dependency-main-only') {
    await fs.writeFile(path.join(roots.dependencyRoot, 'index.js'), 'export default "main-born dependency snap";\n');
    await run([...snapArgs([fixture.dependencyId], 'main-born dependency outside incoming lane'), '--unmodified']);
  }
  const beforeAddition = `${directory}-before-addition`;
  if (scenario.topology === 'addition') {
    // Preserve a real consumer from before the incoming author creates the new
    // component. Restoring it after export models another existing consumer;
    // no bitmap/model rows are synthesized or removed by the fixture.
    await fs.rm(beforeAddition, { recursive: true, force: true });
    await fs.cp(directory, beforeAddition, { recursive: true, verbatimSymlinks: true });
  }
  await run([
    'lane',
    'create',
    'incoming',
    '--scope',
    ['addition', 'inactive-addition'].includes(scenario.topology)
      ? 'qualification.checkout'
      : 'qualification.destination',
  ]);
  if (['addition', 'inactive-addition'].includes(scenario.topology)) {
    const addedRoot = path.join(directory, 'new-component');
    await fs.mkdir(addedRoot, { recursive: true });
    await fs.writeFile(path.join(addedRoot, 'index.js'), 'export default "new lane component";\n');
    await run(['add', 'new-component', '--id', 'new-component', '--scope', 'qualification.checkout']);
    await run(snapArgs(['new-component'], 'incoming new component'));
  }
  if (scenario.topology === 'binary')
    await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 250, 13, 10, 129]));
  else if (['deletion', 'delete-diverged', 'delete-conflict'].includes(scenario.topology))
    await fs.rm(path.join(root, 'added.js'));
  else if (scenario.topology === 'eol')
    await fs.writeFile(
      path.join(root, 'index.js'),
      '\ufeff' + base.replace('last = "base"', 'last = "incoming"').replaceAll('\n', '\r\n')
    );
  else await fs.writeFile(path.join(root, 'index.js'), base.replace('last = "base"', 'last = "incoming"'));
  if (scenario.topology === 'config') await run(['deprecate', fixture.id]);
  if (scenario.topology === 'dependency') {
    await fs.writeFile(path.join(roots.dependencyRoot, 'index.js'), 'export default "incoming dependency";\n');
    await run([...snapArgs([fixture.dependencyId], 'merge transaction incoming dependency'), '--unmodified']);
    await run([...snapArgs([fixture.id], 'merge transaction incoming dependent'), '--unmodified']);
  } else
    await run([
      ...snapArgs([fixture.id], 'merge transaction incoming'),
      ...(scenario.built ? ['--build', '--skip-tests'] : []),
    ]);
  if (scenario.topology === 'addition') {
    await run(['export']);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.cp(beforeAddition, directory, { recursive: true, verbatimSymlinks: true });
  } else await run(['switch', 'main', '--skip-fetch', '--skip-dependency-installation']);
  if (scenario.target === 'lane') await run(['lane', 'create', 'destination', '--scope', 'qualification.destination']);
  if (scenario.topology !== 'fast-forward' && scenario.topology !== 'deletion') {
    if (scenario.topology === 'delete-conflict')
      await fs.writeFile(
        path.join(root, 'added.js'),
        'export default "local edit conflicts with incoming deletion";\n'
      );
    else if (scenario.topology === 'binary')
      await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 251, 13, 10, 129]));
    else
      await fs.writeFile(
        path.join(root, 'index.js'),
        base.replace(
          scenario.topology === 'conflict' ? 'last = "base"' : 'first = "base"',
          scenario.topology === 'conflict' ? 'last = "local"' : 'first = "local"'
        )
      );
    await run(snapArgs([fixture.id], 'merge transaction destination'));
  }
}

function commandFor(scenario, fixture) {
  const args =
    scenario.target === 'component'
      ? ['merge', fixture.id, '--skip-dependency-installation']
      : [
          'lane',
          'merge',
          scenario.target === 'main-into-lane'
            ? 'main'
            : ['addition', 'inactive-addition'].includes(scenario.topology)
              ? 'qualification.checkout/incoming'
              : 'incoming',
          '--skip-dependency-installation',
        ];
  if (scenario.strategy) args.push('--auto-merge-resolve', scenario.strategy);
  if (scenario.pattern) args.push('--pattern', fixture.id);
  if (scenario.includeDeps) args.push('--include-deps');
  if (scenario.hidden) args.push('--no-squash');
  if (scenario.noSquash) args.push('--no-squash');
  if (scenario.squash) args.push('--squash');
  if (scenario.message) args.push('--message', scenario.message);
  if (scenario.noAutoSnap) args.push('--no-auto-snap');
  if (scenario.noSnap) args.push('--no-snap');
  if (scenario.detachHead) args.push('--detach-head');
  if (scenario.resolveUnrelated) args.push('--resolve-unrelated', scenario.resolveUnrelated);
  return args;
}

function assertBuiltArtifacts(state) {
  const objects = Object.fromEntries(
    Object.entries(state.objects).map(([hash, hex]) => {
      const bytes = Buffer.from(hex, 'hex');
      const zero = bytes.indexOf(0);
      const type = bytes.subarray(0, zero).toString().split(' ')[0];
      return [
        hash,
        {
          type,
          body: type === 'Version' ? JSON.parse(bytes.subarray(zero + 1).toString()) : undefined,
          inflatedHex: hex,
        },
      ];
    })
  );
  const built = Object.values(objects).filter(
    (object) =>
      object.type === 'Version' &&
      object.body?.buildStatus === 'succeed' &&
      object.body.extensions?.some(
        (extension) =>
          extension.name === 'teambit.pipelines/builder' &&
          Array.isArray(extension.data?.artifacts) &&
          extension.data.artifacts.length > 0
      )
  );
  assert.ok(built.length > 0, 'public incoming build must persist a genuine successful Version with artifacts');
  for (const version of built) {
    const artifacts = version.body.extensions.find((extension) => extension.name === 'teambit.pipelines/builder').data
      .artifacts;
    for (const task of ['TSCompiler', 'ExtractSchema', 'GeneratePreview']) {
      const artifact = artifacts.find((candidate) => candidate.task.name === task);
      assert.ok(artifact?.files?.length > 0, `${task} must produce actual stored artifact refs`);
      for (const file of artifact.files) {
        assert.equal(objects[file.file]?.type, 'Source', `${task} artifact ${file.relativePath} must exist`);
        assert.ok(objects[file.file].inflatedHex.length > 0);
      }
    }
  }
}

module.exports = {
  scenarios,
  createFixture: history.createFixture,
  prepareScenario,
  commandFor,
  assertBuiltArtifacts,
  capture: checkout.capture,
  readTree: checkout.readTree,
};
