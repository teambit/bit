// Diagnostic preload for the actual compiled importer; never substitutes an implementation.
const fs = require('node:fs');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const output = process.env.BIT_IMPORT_TRACE;
process.env.BIT_IMPORT_TRACE_OWNER ??= String(process.pid);
const owner = Number(process.env.BIT_IMPORT_TRACE_OWNER);
const asyncHooks = require('node:async_hooks');
const versionParseContext = new asyncHooks.AsyncLocalStorage();
const versionClasses = new WeakSet();
const asyncTypes = new Map();
function commandSourceBodyBytes(value) {
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((total, [key, item]) => {
    if (['contents', 'body', 'buffer', 'compressed'].includes(key)) {
      if (typeof item === 'string') return total + Buffer.byteLength(item);
      if (item?.type === 'Buffer' && Array.isArray(item.data)) return total + item.data.length;
    }
    return total + commandSourceBodyBytes(item);
  }, 0);
}
const metrics = {
  schemaVersion: 1,
  frameworkObservation:
    process.env.BIT_IMPORT_TRACE_QUERY_ONLY === '1' || process.env.BIT_IMPORT_TRACE_PROTOCOL_ONLY === '1'
      ? 'disabled'
      : 'legacy-class-observer',
  stages: {},
  asyncResources: {},
  objectTypes: {},
  incomingObjectTypes: {},
  operation: { kinds: {}, fallbackKinds: {}, spoolBytes: 0, spoolFallbacks: 0, stalePlans: 0, missingHits: 0 },
  lookupResults: { repository: { found: 0, missing: 0 }, component: { found: 0, missing: 0 } },
  version: { serializedBytes: 0, serializedObjects: 0 },
  mutableFrames: { counts: {}, serializedBytes: 0 },
  materialization: { frames: 0, files: 0, bytes: 0, completed: 0, skipped: 0, failed: 0 },
  persistence: { helpers: 0, frames: 0, actions: 0, completed: 0, failed: 0, kinds: {} },
  checkout: {
    plan: { frames: 0, files: 0, completed: 0, failed: 0, helperIds: [] },
    preflight: { frames: 0, files: 0, completed: 0, failed: 0, helperIds: [] },
    write: { frames: 0, files: 0, completed: 0, failed: 0, helperIds: [] },
  },
  workspaceFrames: [],
  postPersistNotifications: 0,
  importFrames: [],
  workspace: Object.fromEntries(
    [
      'dependencyScan',
      'dependencyResolve',
      'dependencyCacheRead',
      'dependencyCacheFreshness',
      'statusPrepare',
      'statusScan',
      'statusFinish',
      'statusComplete',
      'statusContext',
      'statusCompare',
      'statusResult',
      'statusHistoryValidate',
      'statusHistoryCommit',
      'workspaceDiff',
      'commandPrepare',
      'commandPlan',
      'commandPolicyPrepare',
      'commandDependencyDetect',
      'commandDependencyComplete',
      'commandLaneFinalize',
      'commandFinalize',
      'commandApply',
      'commandRecoveryPrepare',
      'commandRecoveryPlan',
      'commandRecoveryRestore',
      'commandRecoveryApply',
      'commandResolvePrepare',
      'commandResolvePlan',
      'commandResolveFinalize',
      'commandResolveApply',
      'dependencyPolicyCached',
      'dependencyGraph',
      'dependencyDetectFresh',
      'dependencyPolicyDetected',
      'dependencyFreshValidate',
      'scan',
      'inventoryBegin',
      'inventoryFinish',
      'inventoryCancel',
      'read',
      'compare',
      'diff',
      'fileStatus',
    ].map((kind) => [
      kind,
      {
        frames: 0,
        files: 0,
        completed: 0,
        failed: 0,
        ...(kind.startsWith('command') ? { sourceBodyBytes: 0 } : {}),
      },
    ])
  ),
  history: Object.fromEntries(
    ['graph', 'diverge', 'mergeFiles'].map((kind) => [
      kind,
      { frames: 0, files: 0, completed: 0, failed: 0, workspaceFiles: 0, storedSources: 0, bodyBytes: 0 },
    ])
  ),
  mergeState: Object.fromEntries(
    [
      'initialize',
      'transition',
      'commit',
      'laneSnap',
      'reconcileSnap',
      'squashPolicy',
      'squashMessages',
      'historyRebase',
      'configComponent',
      'configWorkspaceUpdates',
      'configWorkspaceMerge',
      'configWorkspaceConflictPlan',
      'configWorkspaceConflictCommit',
      'configScopePolicy',
      'recoveryInitialize',
      'recoveryAdvance',
      'recoveryBitmap',
      'resetRefsPlan',
      'snapshotTransactionBegin',
      'snapshotTransactionReceipt',
      'snapshotRepositoryBegin',
      'snapshotRepositoryReceipt',
      'snapshotVersionIdentity',
      'snapshotDependencyUpdates',
      'snapshotAutoTag',
      'snapshotFutureVersions',
      'snapshotSerialize',
      'snapshotCommit',
      'transferCollect',
      'transferInitialize',
      'transferArchive',
      'transferRelease',
      'transferPending',
      'transferTransactionInitialize',
      'transferTransactionReceipt',
      'inspectionBegin',
      'inspectionFiles',
      'inspectionCompare',
      'inspectionDiff',
      'inspectionFinish',
      'checkoutSelectBegin',
      'checkoutSelectReceipt',
      'checkoutApplyDecision',
      'checkoutPrepare',
      'checkoutRemovals',
      'checkoutApply',
      'checkoutMaterialize',
      'checkoutFinish',
      'historyResetBegin',
      'historyResetReceipt',
      'historyResetFork',
      'historyResetFinish',
      'historyResetCandidates',
      'historyResetPattern',
      'historyResetLocalAppend',
      'historyResetLocalRead',
      'historyResetLocalVersions',
      'historyResetDependents',
      'historyResetComponentPlan',
      'historyResetLaneHistory',
      'historyResetSoft',
      'historyResetNeverExported',
      'historyQueryBegin',
      'historyQueryFiles',
      'historyQueryBlame',
      'historyQueryDiff',
      'historyQueryFinish',
      'historyQueryPopulateBegin',
      'historyQueryShow',
      'historyQueryToposort',
      'mergeTransactionBegin',
      'mergeTransactionReceipt',
      'mergeTransactionFinish',
      'mergeStatusBegin',
      'mergeStatusReceipt',
      'mergeApplyDecision',
      'mergeLaneBucketDecision',
      'mergeResultsSelect',
      'mergeDependencyCandidates',
      'mergeDependencyMissing',
      'mergePatternDependencies',
      'mergePatternOutcome',
      'mergePlanOrder',
      'mergePrepare',
      'mergeApply',
      'mergeRemovals',
      'mergeMaterialize',
    ].map((kind) => [
      kind,
      {
        frames: 0,
        files: 0,
        completed: 0,
        failed: 0,
        ...(kind.startsWith('snapshot') ||
        kind.startsWith('inspection') ||
        kind.startsWith('checkout') ||
        kind.startsWith('historyReset') ||
        kind.startsWith('historyQuery') ||
        kind.startsWith('merge')
          ? { helperIds: [] }
          : {}),
        ...(kind.startsWith('checkout') || kind.startsWith('historyReset')
          ? { tokens: [], sourceBodyBytes: 0, snapshotBytes: 0, stepsCompleted: 0, dataFailed: 0 }
          : {}),
        ...(kind.startsWith('historyReset') ? { phases: [], children: [] } : {}),
        ...(kind.startsWith('merge')
          ? {
              tokens: [],
              planTokens: [],
              phases: [],
              sourceBodyBytes: 0,
              retainedBodies: 0,
              retainedBytes: 0,
              stepsCompleted: 0,
              dataFailed: 0,
              verifiedReads: [],
              selections: [],
            }
          : {}),
        ...(kind.startsWith('historyQuery')
          ? { tokens: [], sourceBodyBytes: 0, publicContentBytes: 0, verifiedReads: [] }
          : {}),
        ...(kind.startsWith('inspection')
          ? {
              snapshotBytes: 0,
              sourceBodyBytes: 0,
              publicContentBytes: 0,
              tokens: [],
              retainedReads: 0,
              spooledFiles: 0,
            }
          : {}),
        ...(kind === 'inspectionCompare' ? { modelHashes: [] } : {}),
        ...(kind === 'snapshotSerialize'
          ? {
              objects: 0,
              acceptedTypes: {},
              sources: 0,
              workspaceSources: 0,
              artifactSources: 0,
              repositorySources: 0,
              generatedSources: 0,
              bodyBytes: 0,
            }
          : {}),
        ...(kind === 'snapshotCommit' ? { stepsCompleted: 0, dataFailed: 0 } : {}),
        ...(kind === 'recoveryAdvance' ? { stepsCompleted: 0, dataFailed: 0 } : {}),
        ...(kind.startsWith('transfer') ? { objects: 0, sources: 0, bodyBytes: 0, archiveBytes: 0 } : {}),
      },
    ])
  ),
  snapshot: Object.fromEntries(
    ['commit', 'plan', 'index', 'indexWrite'].map((kind) => [
      kind,
      { frames: 0, files: 0, completed: 0, failed: 0, workspaceSources: 0, sourceBodyBytes: 0 },
    ])
  ),
  inflation: { incoming: 0, repository: 0 },
  receivedObjects: 0,
  receivedCompressedBytes: 0,
  native: {
    instances: 0,
    submitted: 0,
    sources: 0,
    legacy: 0,
    batches: 0,
    metadata: 0,
    persisted: 0,
    writeFallbacks: 0,
    mutableBatches: 0,
    mutableSubmitted: 0,
    mutablePersisted: 0,
    mutableFallbacks: 0,
  },
  tar: { operations: 0, objects: 0, nativeSources: 0, fallbacks: 0, batches: 0 },
  modules: {},
};
// Observe workspace wire acknowledgements without wrapping writer methods whose
// identities decide native eligibility. This preload is excluded from timing.
let nextImportTransport = 0;
function observeWorkspaceTransport(child) {
  if (!child.stdin || !child.stdout) return child;
  let importId;
  let workspace = false,
    workspaceId;
  const requests = [];
  const requestTimes = [];
  let pending = Buffer.alloc(0);
  let binaryRemaining = 0;
  const write = child.stdin.write;
  child.stdin.write = function (bytes, ...rest) {
    const magic = Buffer.isBuffer(bytes) ? bytes.subarray(0, 4).toString() : '';
    if (['BOI1', 'BOI2', 'BOI3', 'BOC2', 'BOC3', 'BMP1', 'BMS1', 'BTI1', 'BTI2', 'BTC1', 'BTP1'].includes(magic)) {
      importId ||= ++nextImportTransport;
      metrics.importFrames.push({ backend: child.backend || 'process', magic, transportId: importId });
    }
    if (['BWM1', 'BWP1', 'BWC0', 'BWC2', 'BWC1', 'BCK1', 'BWS1', 'BSS1', 'BMH1', 'BMT1'].includes(magic)) {
      if (!workspace) workspaceId = ++metrics.persistence.helpers;
      workspace = true;
      const operation = ['BWS1', 'BSS1', 'BMH1', 'BMT1'].includes(magic)
        ? JSON.parse(bytes.subarray(12).toString())
        : undefined;
      metrics.workspaceFrames.push({
        backend: child.backend || 'process',
        magic,
        kind: operation?.kind,
        helperId: workspaceId,
        id: bytes.readUInt32BE(4),
        ...(operation?.kind?.startsWith('merge')
          ? Object.fromEntries(
              ['token', 'planToken', 'index', 'revision', 'phase', 'observe']
                .filter((key) => operation[key] !== undefined)
                .map((key) => [key, operation[key]])
            )
          : {}),
      });
      requestTimes.push(process.hrtime.bigint());
      requests.push(operation ? `${magic}:${operation.kind}` : magic);
      if (operation) {
        // Observation must not prevent a new workspace operation from reaching Rust.
        if (magic === 'BWS1' && !Object.hasOwn(metrics.workspace, operation.kind))
          Object.defineProperty(metrics.workspace, operation.kind, {
            value: { frames: 0, files: 0, completed: 0, failed: 0 },
            enumerable: true,
          });
        const metric = (
          magic === 'BMT1'
            ? metrics.mergeState
            : magic === 'BMH1'
              ? metrics.history
              : magic === 'BSS1'
                ? metrics.snapshot
                : metrics.workspace
        )[operation.kind];
        metric.frames++;
        if (magic === 'BWS1') metric.requestBytes = (metric.requestBytes || 0) + bytes.length;
        if (magic === 'BWS1' && operation.kind.startsWith('command'))
          metric.sourceBodyBytes += commandSourceBodyBytes(operation);
        if (magic === 'BWS1' && operation.kind === 'statusCompare')
          metric.identities = [...(metric.identities || []), ...operation.targets.map((target) => target.identity)];
        if (metric.helperIds && !metric.helperIds.includes(workspaceId)) metric.helperIds.push(workspaceId);
        metric.files += ['BMH1', 'BMT1'].includes(magic)
          ? 1
          : magic === 'BSS1'
            ? operation.kind === 'commit'
              ? operation.objects.length
              : 1
            : operation.files?.length || operation.target?.length || (operation.kind === 'compare' ? 1 : 0);
        if (magic === 'BMT1' && operation.kind.startsWith('inspection') && operation.token)
          metric.tokens.push({ token: operation.token, helperId: workspaceId });
        if (
          magic === 'BMT1' &&
          (operation.kind.startsWith('checkout') ||
            operation.kind.startsWith('historyReset') ||
            operation.kind.startsWith('historyQuery') ||
            operation.kind.startsWith('merge'))
        ) {
          if (operation.token) metric.tokens.push({ token: operation.token, helperId: workspaceId });
          if (operation.kind.startsWith('merge') && operation.planToken)
            metric.planTokens.push({ token: operation.planToken, helperId: workspaceId });
          if (operation.kind.startsWith('historyReset') && operation.phase)
            metric.phases.push({
              token: operation.token,
              revision: operation.revision,
              phase: operation.phase,
              helperId: workspaceId,
            });
          if (operation.kind.startsWith('merge') && (operation.phase || operation.observe))
            metric.phases.push({
              token: operation.token,
              phase: operation.phase || operation.observe,
              revision: operation.revision,
              index: operation.index,
              completed: operation.completed,
              helperId: workspaceId,
            });
          const inspect = (value) => {
            if (!value || typeof value !== 'object') return;
            for (const [key, item] of Object.entries(value)) {
              if (['contents', 'body', 'buffer', 'compressed'].includes(key) && typeof item === 'string')
                metric.sourceBodyBytes += Buffer.byteLength(item);
              else if (
                ['contents', 'body', 'buffer', 'compressed'].includes(key) &&
                item?.type === 'Buffer' &&
                Array.isArray(item.data)
              )
                metric.sourceBodyBytes += item.data.length;
              else if (item && typeof item === 'object') inspect(item);
            }
          };
          inspect(operation);
        }
        if (magic === 'BMT1' && operation.kind === 'inspectionCompare') {
          const field = (value, name) =>
            value?.kind === 'object'
              ? value.value.find(([key]) => (typeof key === 'string' ? key : String.fromCharCode(...key)) === name)?.[1]
              : undefined;
          const files = field(operation.left, 'files');
          for (const file of (Array.isArray(files) ? files : files?.value) || []) {
            const reference = field(file, 'file');
            const value =
              typeof reference === 'string' || reference?.kind === 'string' ? reference : field(reference, 'hash');
            if (typeof value === 'string') metric.modelHashes.push(value);
            else if (value?.kind === 'string')
              metric.modelHashes.push(
                typeof value.value === 'string' ? value.value : String.fromCharCode(...value.value)
              );
          }
        }
        if (magic === 'BMT1' && operation.kind === 'snapshotSerialize') {
          metric.objects += operation.objects?.length || 0;
          for (const object of operation.objects || []) {
            if (object.type === 'Source') {
              metric.sources++;
              metric.workspaceSources += Number(Boolean(object.source));
              metric.artifactSources += Number(object.source?.normalization === 'linuxEol');
              metric.repositorySources += Number(Boolean(object.repository));
              metric.generatedSources += Number(typeof object.body === 'string');
              metric.bodyBytes += (object.body?.length || 0) / 2;
            }
          }
        }
        if (magic === 'BMT1' && operation.kind === 'transferInitialize') {
          for (const object of operation.objects || []) {
            if (object.metadata?.type === 'Source') metric.bodyBytes += (object.metadata.compressed?.length || 0) / 2;
          }
        }
        if (magic === 'BMH1' && operation.kind === 'mergeFiles') {
          for (const file of operation.current || []) {
            metric.workspaceFiles += Number(Boolean(file.workspace));
            metric.bodyBytes += (file.body?.length || 0) / 2;
            metric.storedSources += Number(Boolean(file.source));
          }
          metric.storedSources += (operation.base?.length || 0) + (operation.other?.length || 0);
        }
        if (magic === 'BSS1' && operation.kind === 'commit') {
          for (const object of operation.objects) {
            if (object.type !== 'Source') continue;
            metric.workspaceSources += Number(Boolean(object.workspace));
            metric.sourceBodyBytes += (object.body?.length || 0) / 2;
          }
        }
      } else if (magic === 'BWM1') {
        metrics.materialization.frames++;
        metrics.materialization.files += bytes.readUInt32BE(8);
        metrics.materialization.bytes += bytes.length;
      } else if (magic === 'BWC0' || magic === 'BWC2' || magic === 'BWC1' || magic === 'BCK1') {
        const metric =
          magic === 'BCK1'
            ? metrics.checkout.plan
            : magic === 'BWC0' || magic === 'BWC2'
              ? metrics.checkout.preflight
              : metrics.checkout.write;
        metric.frames++;
        if (magic === 'BWS1') metric.requestBytes = (metric.requestBytes || 0) + bytes.length;
        if (metric.helperIds && !metric.helperIds.includes(workspaceId)) metric.helperIds.push(workspaceId);
        metric.files +=
          magic === 'BCK1' ? JSON.parse(bytes.subarray(12).toString()).expectedFiles.length : bytes.readUInt32BE(8);
      } else {
        metrics.persistence.frames++;
        const count = bytes.readUInt32BE(8);
        metrics.persistence.actions += count;
        let offset = 12;
        for (let index = 0; index < count; index++) {
          const kind = ['remove', 'empty', 'link', 'symlink'][bytes.readUInt32BE(offset)];
          metrics.persistence.kinds[kind] = (metrics.persistence.kinds[kind] || 0) + 1;
          offset += 4;
          for (let filename = 0; filename < 2; filename++) offset += 4 + bytes.readUInt32BE(offset);
        }
      }
    }
    return write.call(this, bytes, ...rest);
  };
  child.stdout.on('data', (bytes) => {
    if (!workspace) return;
    pending = Buffer.concat([pending, bytes]);
    while (true) {
      if (binaryRemaining) {
        const consumed = Math.min(binaryRemaining, pending.length);
        pending = pending.subarray(consumed);
        binaryRemaining -= consumed;
        if (binaryRemaining) return;
      }
      const newline = pending.indexOf(10);
      if (newline < 0) return;
      const magic = requests.shift();
      const started = requestTimes.shift();
      const metric = magic?.startsWith('BMT1:')
        ? metrics.mergeState[magic.slice(5)]
        : magic?.startsWith('BMH1:')
          ? metrics.history[magic.slice(5)]
          : magic?.startsWith('BSS1:')
            ? metrics.snapshot[magic.slice(5)]
            : magic?.startsWith('BWS1:')
              ? metrics.workspace[magic.slice(5)]
              : magic === 'BWM1'
                ? metrics.materialization
                : magic === 'BCK1'
                  ? metrics.checkout.plan
                  : magic === 'BWC0' || magic === 'BWC2'
                    ? metrics.checkout.preflight
                    : magic === 'BWC1'
                      ? metrics.checkout.write
                      : metrics.persistence;
      try {
        const response = JSON.parse(pending.subarray(0, newline).toString());
        if (magic?.startsWith('BWS1:')) {
          const frame = metrics.workspaceFrames.find(
            (frame) =>
              frame.helperId === workspaceId &&
              frame.magic === 'BWS1' &&
              frame.id === response.id &&
              frame.kind === magic.slice(5)
          );
          if (frame)
            frame.receipt = {
              completed: response.completed || 0,
              failed: Boolean(response.failed),
              applied: response.data?.applied === true,
              ...(magic === 'BWS1:commandRecoveryRestore' ? { restored: response.data?.restored === true } : {}),
              ...(magic === 'BWS1:commandFinalize'
                ? { snapped: response.data?.result?.mergeSnapResults?.snappedComponents?.length || 0 }
                : {}),
            };
          metric.responseBytes = (metric.responseBytes || 0) + newline + 1;
          if (magic.startsWith('BWS1:command')) metric.sourceBodyBytes += commandSourceBodyBytes(response.data);
          if (started !== undefined)
            metric.summedRoundTripMs =
              (metric.summedRoundTripMs || 0) + Number(process.hrtime.bigint() - started) / 1e6;
        }
        if (
          (magic === 'BWS1:read' || magic === 'BWC2') &&
          Number.isSafeInteger(response.binaryBytes) &&
          response.binaryBytes >= 0
        )
          binaryRemaining = response.binaryBytes;
        if (magic === 'BWC2') {
          metric.bodyFrames = (metric.bodyFrames || 0) + Number(response.completed > 0 && !response.failed);
          metric.rawBodyBytes = (metric.rawBodyBytes || 0) + (response.binaryBytes || 0);
        }
        if (magic === 'BWS1:commandRecoveryRestore' && response.data?.restored === true && !response.failed) {
          metric.restored = (metric.restored || 0) + 1;
        }
        if (
          ['BWS1:commandApply', 'BWS1:commandRecoveryApply', 'BWS1:commandResolveApply'].includes(magic) &&
          response.data?.applied === true &&
          !response.failed
        ) {
          metric.applied = (metric.applied || 0) + 1;
          metrics.postPersistNotifications += response.data?.postPersistNotifications || 0;
        }
        metric.completed += response.completed || 0;
        if (
          magic === 'BWS1:dependencyCacheRead' &&
          !response.failed &&
          Number.isSafeInteger(response.data?.cache?.timestamp) &&
          typeof response.data.cache.data === 'string'
        )
          metric.hits = (metric.hits || 0) + 1;
        if (magic?.startsWith('BMT1:historyQuery') && response.completed > 0 && !response.failed) {
          if (response.data?.token) metric.tokens.push({ token: response.data.token, helperId: workspaceId });
          if (response.data?.reads) metric.verifiedReads.push({ ...response.data.reads, helperId: workspaceId });
          for (const row of [
            ...(response.data?.rows || []),
            ...(response.data?.lines || []),
            ...(response.data?.files || []),
          ])
            for (const key of ['fromContent', 'toContent', 'lineContent', 'previousLineContent', 'rawDiff'])
              if (typeof row[key] === 'string') metric.publicContentBytes += Buffer.byteLength(row[key]);
          for (const key of ['fromContent', 'toContent'])
            if (typeof response.data?.[key] === 'string')
              metric.publicContentBytes += Buffer.byteLength(response.data[key]);
        }
        if (magic?.startsWith('BMT1:merge') && response.completed > 0 && !response.failed) {
          if (Array.isArray(response.data?.selected) || Array.isArray(response.data?.missing))
            metric.selections.push({
              indices: response.data.selected || response.data.missing,
              ...(Array.isArray(response.data?.checked) ? { checked: response.data.checked } : {}),
              helperId: workspaceId,
            });
          if (response.data?.token) metric.tokens.push({ token: response.data.token, helperId: workspaceId });
          if (response.data?.reads) metric.verifiedReads.push({ ...response.data.reads, helperId: workspaceId });
          if (magic === 'BMT1:mergePrepare' && response.data?.token)
            metric.planTokens.push({
              token: response.data.token,
              ownerToken: response.data.ownerToken,
              helperId: workspaceId,
            });
          metric.stepsCompleted += response.data?.completed || 0;
          metric.dataFailed += Number(response.data?.failed === true);
          for (const body of response.data?.bodies || []) {
            metric.retainedBodies++;
            metric.retainedBytes += body.bytes || 0;
          }
        }
        if (magic === 'BMT1:snapshotCommit') {
          metric.stepsCompleted += response.data?.completed || 0;
          metric.dataFailed += Number(response.data?.failed === true);
        }
        if (magic === 'BMT1:snapshotSerialize' && response.completed > 0 && !response.failed)
          for (const object of response.data?.objects || [])
            metric.acceptedTypes[object.type] = (metric.acceptedTypes[object.type] || 0) + 1;
        if (magic === 'BMT1:recoveryAdvance') {
          metric.stepsCompleted += response.data?.completed || 0;
          metric.dataFailed += Number(response.data?.failed === true);
        }
        if (magic?.startsWith('BMT1:checkout')) {
          if (response.data?.token) metric.tokens.push({ token: response.data.token, helperId: workspaceId });
          metric.stepsCompleted += response.data?.completed || 0;
          metric.dataFailed += Number(response.data?.failed === true);
          for (const file of response.data?.files || []) metric.snapshotBytes += file.bytes || 0;
          if (magic === 'BMT1:checkoutPrepare')
            for (const body of response.data?.bodies || []) metric.snapshotBytes += body.bytes || 0;
        }
        if (magic?.startsWith('BMT1:historyReset')) {
          if (response.data?.token) metric.tokens.push({ token: response.data.token, helperId: workspaceId });
          for (const child of response.data?.children || [])
            metric.children.push({
              token: child.token,
              revision: child.revision,
              directive: child.directive,
              helperId: workspaceId,
            });
        }
        if (magic === 'BMT1:inspectionBegin') {
          metric.retainedReads += response.data?.retainedReads || 0;
          metric.spooledFiles += response.data?.spooledFiles || 0;
          if (response.data?.token) metric.tokens.push({ token: response.data.token, helperId: workspaceId });
          for (const file of response.data?.files || []) {
            metric.snapshotBytes += file.bytes || 0;
            for (const key of ['contents', 'body', 'buffer'])
              if (typeof file[key] === 'string') metric.sourceBodyBytes += Buffer.byteLength(file[key]);
          }
        }
        if (magic === 'BMT1:inspectionDiff') {
          for (const file of response.data?.files || [])
            metric.publicContentBytes +=
              Buffer.byteLength(file.fromContent || '') + Buffer.byteLength(file.toContent || '');
        }
        if (magic === 'BMT1:transferCollect') {
          metric.objects += response.data?.objects?.length || 0;
          metric.sources += response.data?.objects?.filter((object) => object.type === 'Source').length || 0;
        }
        if (magic === 'BMT1:transferInitialize') metric.objects += response.data?.count || 0;
        if (magic === 'BMT1:transferArchive') metric.archiveBytes += response.data?.bytes || 0;
        if (['BWS1:scan', 'BWS1:inventoryBegin', 'BWS1:inventoryFinish'].includes(magic))
          metric.files += response.completed || 0;
        if ('skipped' in metric) metric.skipped += response.skipped?.length || 0;
        metric.failed += Number(response.failed === true);
      } catch {
        metric.failed++;
      }
      pending = pending.subarray(newline + 1);
    }
  });
  return child;
}
if (output && process.pid === owner) {
  const childProcess = require('node:child_process');
  const spawn = childProcess.spawn;
  childProcess.spawn = function (...args) {
    return observeWorkspaceTransport(spawn.apply(this, args));
  };
  const workspaceAddon = process.env.BIT_TEST_WORKSPACE_ADDON || process.env.BIT_IMPORT_TRACE_WORKSPACE_ADDON;
  if (workspaceAddon) {
    const { EventEmitter } = require('node:events');
    const binding = require(workspaceAddon);
    const { WorkspaceEngine, ImportStreamEngine } = binding;
    if (ImportStreamEngine) {
      binding.ImportStreamEngine = class extends ImportStreamEngine {
        constructor(callback, ...args) {
          const transport = observeWorkspaceTransport({
            backend: 'addon',
            stdin: { write() {} },
            stdout: new EventEmitter(),
          });
          super(
            (event) => {
              if (event.kind === 'output') transport.stdout.emit('data', event.data);
              callback(event);
            },
            ...args
          );
          this.traceTransport = transport;
        }
        write(bytes) {
          this.traceTransport.stdin.write(bytes);
          return super.write(bytes);
        }
        writev(parts) {
          for (const bytes of parts) this.traceTransport.stdin.write(bytes);
          return super.writev(parts);
        }
      };
    }
    const request = WorkspaceEngine.prototype.request;
    const transports = new WeakMap();
    WorkspaceEngine.prototype.request = async function (bytes) {
      let transport = transports.get(this);
      if (!transport) {
        transport = observeWorkspaceTransport({ backend: 'addon', stdin: { write() {} }, stdout: new EventEmitter() });
        transports.set(this, transport);
      }
      transport.stdin.write(bytes);
      const response = await request.call(this, bytes);
      transport.stdout.emit('data', response);
      return response;
    };
  }
}
if (output && process.pid === owner)
  asyncHooks
    .createHook({
      init(id, type) {
        if (!['FSREQCALLBACK', 'FSREQPROMISE', 'ZLIB', 'WRITEWRAP', 'PROMISE'].includes(type)) return;
        asyncTypes.set(id, type);
        (metrics.asyncResources[type] ||= { created: 0, callbacks: 0 }).created++;
      },
      before(id) {
        const type = asyncTypes.get(id);
        if (type) metrics.asyncResources[type].callbacks++;
      },
      destroy(id) {
        asyncTypes.delete(id);
      },
    })
    .enable();
const seen = new WeakMap();
function wrap(target, key, stage, inspect) {
  // Snapshot defaults are captured before this observer sees module exports.
  // Observe their native acknowledgements instead of changing eligibility.
  if (
    process.env.BIT_RUST_CLIENT_VCS === 'on' &&
    [
      'debug',
      'trace',
      'info',
      'warn',
      'error',
      'toBuffer',
      'load',
      'parse',
      'parseObject',
      'parseObjectWithSize',
      'parseInflatedObjectWithSize',
      'toObject',
      'writeObjectsToTheFS',
      'getNativeSourceStoreOptions',
      'getNativeSourceStoreEligibility',
      'writeValidatedSourceToFS',
      'writeRemoteLanes',
      '_findComponent',
      'validateBeforePersisting',
      'validateVersion',
      'validate',
      'getChownOptions',
      '_writeOne',
      'writeObjectFile',
      'addMany',
      'write',
    ].includes(key)
  )
    return;
  if (!target || typeof target[key] !== 'function') return;
  let keys = seen.get(target);
  if (!keys) {
    keys = new Set();
    seen.set(target, keys);
  }
  if (keys.has(key)) return;
  keys.add(key);
  const original = target[key];
  target[key] = function (...args) {
    const stageName = typeof stage === 'function' ? stage.call(this, args) : stage;
    const started = process.hrtime.bigint();
    const record = () => {
      const data = (metrics.stages[stageName] ||= { calls: 0, summedInclusiveMs: 0 });
      data.calls++;
      data.summedInclusiveMs += Number(process.hrtime.bigint() - started) / 1e6;
    };
    try {
      const result = original.apply(this, args);
      if (result?.then)
        return result.then(
          (value) => {
            record();
            inspect?.call(this, value, args);
            return value;
          },
          (error) => {
            record();
            throw error;
          }
        );
      record();
      inspect?.call(this, result, args);
      return result;
    } catch (error) {
      record();
      throw error;
    }
  };
}
const observedPersistRepositories = new WeakSet();
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const originalValue = originalLoad.apply(this, arguments);
  if (
    !output ||
    process.env.BIT_IMPORT_TRACE_QUERY_ONLY === '1' ||
    process.env.BIT_IMPORT_TRACE_PROTOCOL_ONLY === '1' ||
    process.pid !== owner ||
    !/objects|scope|version|repositories|repository|component.*merger|remote-lanes|source-validator|object-importer|rust-tar/.test(
      request
    )
  )
    return originalValue;
  // Reading Babel re-export getters can hydrate model classes solely for diagnostics.
  // Observe data exports without changing the lazy module's public identity or writes.
  const value =
    process.env.BIT_RUST_CLIENT_VCS === 'on' &&
    originalValue &&
    (typeof originalValue === 'object' || typeof originalValue === 'function')
      ? new Proxy(originalValue, { get: (target, key) => Object.getOwnPropertyDescriptor(target, key)?.value })
      : originalValue;
  const repository = value?.Repository || (value?.default?.name === 'Repository' ? value.default : undefined);
  if (repository && !observedPersistRepositories.has(repository)) {
    observedPersistRepositories.add(repository);
    const observe = (callback) =>
      typeof callback !== 'function'
        ? callback
        : function (...args) {
            metrics.postPersistNotifications++;
            return callback.apply(this, args);
          };
    let callback = observe(repository.onPostObjectsPersist);
    Object.defineProperty(repository, 'onPostObjectsPersist', {
      configurable: true,
      get: () => callback,
      set: (value) => {
        callback = observe(value);
      },
    });
  }
  const Version = value?.Version || (value?.default?.name === 'Version' ? value.default : undefined);
  if (Version && !versionClasses.has(Version) && process.env.BIT_RUST_CLIENT_VCS !== 'on') {
    versionClasses.add(Version);
    const validate = Version.prototype.validateBeforePersisting;
    if (typeof validate === 'function') {
      Version.prototype.validateBeforePersisting = function (...args) {
        return versionParseContext.run('persist-validation', () => validate.apply(this, args));
      };
    }
    wrap(Version, 'parse', () =>
      versionParseContext.getStore() === 'persist-validation' ? 'versionParseForPersistence' : 'versionParseOther'
    );
    wrap(Version.prototype, 'validateBeforePersisting', 'versionPersistValidation');
    wrap(Version.prototype, 'validateVersion', 'versionConstructorChecks');
    wrap(Version.prototype, 'validate', 'versionFullValidation');
    wrap(Version.prototype, 'toObject', 'versionObjectProjection');
    wrap(Version.prototype, 'toBuffer', 'versionSerialization', function (buffer) {
      metrics.version.serializedObjects++;
      metrics.version.serializedBytes += buffer.byteLength;
    });
    // Keep serialize/compressWithSize identities intact: native eligibility compares them to BitObject's methods.
  }
  if (value?.Repository) {
    wrap(value.Repository.prototype, 'load', 'repositoryObjectLoad', function (result) {
      metrics.lookupResults.repository[result ? 'found' : 'missing']++;
    });
    wrap(value.Repository.prototype, 'writeObjectsToTheFS', 'repositoryWriteAndIndex');
    wrap(value.Repository.prototype, 'getNativeSourceStoreEligibility', 'nativeStoreEligibility');
    wrap(value.Repository.prototype, 'getNativeSourceStoreOptions', 'nativeStoreOptions');
    wrap(value.Repository.prototype, 'getChownOptions', 'nativeStoreOwnership');
    wrap(value.Repository.prototype, 'writeValidatedSourceToFS', 'nativeAtomicPersistence');
    wrap(value.Repository.prototype, '_writeOne', 'legacyPersistence');
    wrap(value.Repository.prototype, 'writeObjectFile', 'atomicFileWrite');
    wrap(value.Repository.prototype, 'writeRemoteLanes', 'remoteLanePersistence');
  }
  for (const [name, methods] of Object.entries({
    ScopeIndex: { addMany: 'scopeIndexAdd', write: 'scopeIndexWrite' },
    SourceRepository: { _findComponent: 'existingComponentLookup' },
    MultipleComponentMerger: { merge: 'multipleComponentMerge' },
    ModelComponentMerger: { merge: 'modelComponentMergePolicy' },
    VersionHistory: { merge: 'versionHistoryMergePolicy', mergeNative: 'versionHistoryNativeApply' },
    LaneHistory: { merge: 'laneHistoryMergePolicy', mergeNative: 'laneHistoryNativeApply' },
    RemoteLanes: { addEntriesFromModelComponents: 'remoteLaneEntries' },
  })) {
    const target = value?.[name] || (value?.default?.name === name ? value.default : undefined);
    for (const [method, stage] of Object.entries(methods))
      wrap(
        target?.prototype,
        method,
        stage,
        name === 'SourceRepository'
          ? function (result) {
              metrics.lookupResults.component[result ? 'found' : 'missing']++;
            }
          : undefined
      );
  }
  if (value?.BitObject) {
    wrap(value.BitObject, 'parseInflatedObjectWithSize', 'nativeMetadataHydration');
    wrap(value.BitObject, 'parseObjectWithSize', 'legacyParse', function (result, args) {
      metrics.inflation[args[1] === undefined ? 'incoming' : 'repository']++;
      const type = result.object.getType();
      metrics.objectTypes[type] = (metrics.objectTypes[type] || 0) + 1;
      if (args[1] === undefined) metrics.incomingObjectTypes[type] = (metrics.incomingObjectTypes[type] || 0) + 1;
    });
  }
  if (value?.ObjectsWritable)
    wrap(value.ObjectsWritable.prototype, 'writeObjectToFs', 'streamObjectProcessing', function (_, args) {
      metrics.receivedObjects++;
      metrics.receivedCompressedBytes += args[0].buffer.length;
    });
  if (value?.ObjectFetcher) {
    wrap(value.ObjectFetcher.prototype, 'fetchFromRemoteAndWrite', 'fetchAndPersistOperation');
    wrap(value.ObjectFetcher.prototype, 'fetchFromSingleRemote', 'remoteFetchUntilStream');
    wrap(value.ObjectFetcher.prototype, 'mergeAndPersistComponents', 'componentMergeAndIndex');
  }
  if (value?.RustSourceValidator) {
    wrap(value.RustSourceValidator.prototype, 'validate', 'nativeValidation');
    wrap(value.RustSourceValidator.prototype, 'dispose', 'helperDisposal', function () {
      if (this.child) metrics.native.instances++;
      for (const key of ['submitted', 'sources', 'legacy', 'batches']) metrics.native[key] += this.stats[key];
    });
  }
  if (value?.NativeImportOperation) {
    wrap(value.NativeImportOperation.prototype, 'disposeAndWait', 'nativeOperationDisposal', function () {
      metrics.operation.stalePlans += this.stats.stalePlans;
      metrics.operation.missingHits += this.stats.missingHits;
      this.stats.stalePlans = 0;
    });
    wrap(value.NativeImportOperation.prototype, 'request', 'nativeImportPlan', function (result, args) {
      const failed =
        result === undefined ||
        (args[0].kind === 'persist' && result === null) ||
        (args[0].kind === 'indexWrite' && result === false) ||
        (args[0].kind === 'index' && result === null);
      const bucket = failed ? metrics.operation.fallbackKinds : metrics.operation.kinds;
      bucket[args[0].kind] = (bucket[args[0].kind] || 0) + 1;
    });
    wrap(value.NativeImportOperation.prototype, 'appendArchive', 'nativeTarSpool', function (result, args) {
      if (result === undefined) metrics.operation.spoolFallbacks++;
      else metrics.operation.spoolBytes += args[1].length;
    });
  }
  if (value?.RustObjectImporter) {
    wrap(value.RustObjectImporter.prototype, 'importBatch', 'nativeBatchValidationAndPersistence');
    wrap(value.RustObjectImporter.prototype, 'persistMetadata', 'nativeMutableCompressionAndPersistence');
    wrap(value.RustObjectImporter.prototype, 'persistMutableBatch', 'nativeMutableFrame', function (_, args) {
      const objects = args[0];
      metrics.mutableFrames.counts[objects.length] = (metrics.mutableFrames.counts[objects.length] || 0) + 1;
      metrics.mutableFrames.serializedBytes += objects.reduce((sum, object) => sum + object.buffer.byteLength, 0);
    });
    wrap(value.RustObjectImporter.prototype, 'dispose', 'nativeImporterDisposal', function () {
      if (this.child) metrics.native.instances++;
      for (const key of [
        'submitted',
        'sources',
        'legacy',
        'batches',
        'metadata',
        'persisted',
        'writeFallbacks',
        'mutableSubmitted',
        'mutablePersisted',
        'mutableFallbacks',
      ])
        metrics.native[key] += this.stats[key];
      metrics.native.mutableBatches = (metrics.native.mutableBatches || 0) + (this.stats.mutableBatches || 0);
    });
  }
  if (value?.importTarStream)
    wrap(value, 'importTarStream', 'nativeTarIntake', function (result) {
      metrics.tar.operations++;
      metrics.tar.objects += result.objects;
      metrics.tar.nativeSources += result.nativeSources;
      metrics.tar.fallbacks += Number(result.fallback);
    });
  for (const method of ['readTarBatches', 'readProgressiveTarBatches'])
    if (value?.[method])
      wrap(value, method, 'nativeTarProtocol', function (result) {
        metrics.tar.batches += result.batches;
      });
  if (
    value?.ScopeIndex ||
    value?.SourceRepository ||
    value?.MultipleComponentMerger ||
    value?.ModelComponentMerger ||
    value?.VersionHistory ||
    value?.Version ||
    value?.LaneHistory ||
    value?.RemoteLanes ||
    ['SourceRepository', 'Version', 'VersionHistory', 'LaneHistory'].includes(value?.default?.name) ||
    value?.ObjectFetcher ||
    value?.RustSourceValidator ||
    value?.RustObjectImporter ||
    value?.ObjectsWritable ||
    value?.importTarStream ||
    value?.readTarBatches ||
    value?.readProgressiveTarBatches
  ) {
    const file = Module._resolveFilename(request, parent);
    if (!metrics.modules[file])
      metrics.modules[file] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return originalValue;
};
process.on('exit', () => {
  if (output && process.pid === owner) {
    metrics.loadedCommandModels = Object.keys(require.cache).filter(
      (filename) =>
        /[/\\](?:load-bit|model-component|workspace|consumer-component)\.js$/.test(filename) ||
        /[/\\]models[/\\]version\.js$/.test(filename)
    );
    fs.writeFileSync(output, JSON.stringify(metrics, null, 2));
  }
});
