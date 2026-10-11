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
const metrics = {
  schemaVersion: 1,
  stages: {},
  asyncResources: {},
  objectTypes: {},
  incomingObjectTypes: {},
  operation: { kinds: {}, fallbackKinds: {}, spoolBytes: 0, spoolFallbacks: 0, stalePlans: 0, missingHits: 0 },
  lookupResults: { repository: { found: 0, missing: 0 }, component: { found: 0, missing: 0 } },
  version: { serializedBytes: 0, serializedObjects: 0 },
  mutableFrames: { counts: {}, serializedBytes: 0 },
  materialization: { frames: 0, files: 0, bytes: 0, completed: 0, skipped: 0, failed: 0 },
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
// Observe BWM1 wire acknowledgements without wrapping writer methods whose
// identities decide native eligibility. This preload is excluded from timing.
if (output && process.pid === owner) {
  const childProcess = require('node:child_process');
  const spawn = childProcess.spawn;
  childProcess.spawn = function (...args) {
    const child = spawn.apply(this, args);
    if (!child.stdin || !child.stdout) return child;
    let workspace = false;
    let pending = '';
    const write = child.stdin.write;
    child.stdin.write = function (bytes, ...rest) {
      if (Buffer.isBuffer(bytes) && bytes.subarray(0, 4).toString() === 'BWM1') {
        workspace = true;
        metrics.materialization.frames++;
        metrics.materialization.files += bytes.readUInt32BE(8);
        metrics.materialization.bytes += bytes.length;
      }
      return write.call(this, bytes, ...rest);
    };
    child.stdout.on('data', (bytes) => {
      if (!workspace) return;
      pending += bytes.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        try {
          const response = JSON.parse(pending.slice(0, newline));
          metrics.materialization.completed += response.completed || 0;
          metrics.materialization.skipped += response.skipped?.length || 0;
          metrics.materialization.failed += Number(response.failed === true);
        } catch {
          metrics.materialization.failed++;
        }
        pending = pending.slice(newline + 1);
      }
    });
    return child;
  };
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
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const value = originalLoad.apply(this, arguments);
  if (
    !output ||
    process.pid !== owner ||
    !/objects|scope|version|repositories|component.*merger|remote-lanes|source-validator|object-importer|rust-tar/.test(
      request
    )
  )
    return value;
  const Version = value?.Version || (value?.default?.name === 'Version' ? value.default : undefined);
  if (Version && !versionClasses.has(Version)) {
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
  return value;
};
process.on('exit', () => {
  if (output && process.pid === owner) fs.writeFileSync(output, JSON.stringify(metrics, null, 2));
});
