import type Version from '../models/version';
import { captureVersionSerializationPrefix, completeVersionSerialization } from '../models/version';
import { runExtensionDataModelHooks, extensionDataToModelObjectsAfterHooks } from '@teambit/legacy.extension-data';
import {
  hasRustSnapshotFunctions,
  hasRustSnapshotModelHooks,
  hasRustSnapshotTransactionClass,
  hasRustSnapshotValidationHook,
} from './rust-snapshot-guards';
import { projectRustSnapshotFields } from './rust-snapshot-projection';
import { projectRustSnapshotValue, type RustCompactSnapshotValue } from './rust-snapshot-values';

const tailNames = [
  'packageDependencies',
  'devPackageDependencies',
  'peerPackageDependencies',
  'overrides',
  'buildStatus',
  'packageJsonChangedProps',
  'parents',
  'squashed',
  'unrelated',
  'bitVersion',
  'modified',
  'origin',
  'hidden',
  'batchId',
] as const;
const plainNames = [
  'docs',
  'log',
  'packageDependencies',
  'devPackageDependencies',
  'peerPackageDependencies',
  'overrides',
  'packageJsonChangedProps',
  'origin',
] as const;

/** Guard every nested input before the framework model hook is allowed to run. */
export function canPrepareRustSnapshotVersion(version: Version): boolean {
  if (
    !hasRustSnapshotTransactionClass(version, 'Version') ||
    !hasRustSnapshotModelHooks(version.extensions) ||
    !hasRustSnapshotValidationHook(version.extensions) ||
    !hasRustSnapshotFunctions(['Version', 'SnapshotJSON', 'Dependencies', 'ExtensionDataList']) ||
    (version.extensions.length > 0 && !hasRustSnapshotFunctions(['ExtensionDataEntry'])) ||
    !hasRustSnapshotTransactionClass(version.dependencies, 'Dependencies') ||
    !hasRustSnapshotTransactionClass(version.devDependencies, 'Dependencies')
  )
    return false;
  // Ref/ID conversion is valid only at model fields that canonically consume them.
  // Arbitrary user metadata must already be plain JSON data.
  for (let index = 0; index < plainNames.length; index += 1) {
    if (!projectRustSnapshotValue(version[plainNames[index]])) return false;
  }
  for (let index = 0; index < version.extensions.length; index += 1) {
    const entry = Object.getOwnPropertyDescriptor(version.extensions, index)?.value;
    if (!hasRustSnapshotTransactionClass(entry, 'ExtensionDataEntry')) return false;
    const fields = Object.getOwnPropertyDescriptors(entry);
    if (!projectRustSnapshotValue(fields.rawConfig?.value)) return false;
    const name = fields.name?.value;
    if (
      name !== 'teambit.dependencies/dependency-resolver' &&
      name !== 'teambit.pipelines/builder' &&
      !projectRustSnapshotValue(fields.data?.value)
    )
      return false;
  }
  const raw: Record<string, unknown> = {
    files: version.files,
    mainFile: version.mainFile,
    bindingPrefix: version.bindingPrefix,
    schema: version.schema,
    log: version.log,
    docs: version.docs,
    dependencies: version.dependencies.dependencies,
    devDependencies: version.devDependencies.dependencies,
    flattenedDependencies: version.flattenedDependencies,
    flattenedEdges: (version as any).flattenedEdges,
    flattenedEdgesRef: version.flattenedEdgesRef,
    dependenciesGraphRef: version.dependenciesGraphRef,
    extensions: version.extensions,
  };
  for (let index = 0; index < tailNames.length; index += 1) raw[tailNames[index]] = version[tailNames[index]];
  return projectRustSnapshotFields(raw) !== undefined;
}

export type PreparedRustSnapshotVersion = {
  fields?: RustCompactSnapshotValue;
  currentFields: () => RustCompactSnapshotValue | undefined;
  /** A declined helper resumes after the already completed model hook, never before it. */
  canonicalObject: () => ReturnType<typeof completeVersionSerialization>;
};

function tail(version: Version): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (let index = 0; index < tailNames.length; index += 1) fields[tailNames[index]] = version[tailNames[index]];
  if (version.squashed) {
    fields.squashed = {
      previousParents: version.squashed.previousParents,
      laneId: version.squashed.laneId,
    };
  }
  if (version.unrelated) {
    fields.unrelated = { head: version.unrelated.head, laneId: version.unrelated.laneId };
  }
  return fields;
}

/** Freeze only ordinary data; JSON encoding remains the native writer's responsibility. */
export function snapshotCanonicalValue(value: any): any {
  if (!value || typeof value !== 'object') return value;
  const result = Array.isArray(value) ? [] : Object.create(null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (descriptors[key].enumerable) result[key] = snapshotCanonicalValue(descriptors[key].value);
  }
  return result;
}

export function prepareRustSnapshotVersion(version: Version): PreparedRustSnapshotVersion | undefined {
  if (!canPrepareRustSnapshotVersion(version)) return undefined;
  const prefix = captureVersionSerializationPrefix(version);
  runExtensionDataModelHooks(version.extensions);
  const raw: Record<string, unknown> = { ...prefix, extensions: version.extensions, ...tail(version) };
  const fields = projectRustSnapshotFields(raw);
  // The canonical synchronous toBuffer boundary precedes compression. Its continuation
  // must not observe later mutations while the native request is pending.
  const canonical = snapshotCanonicalValue(
    completeVersionSerialization(version, prefix, extensionDataToModelObjectsAfterHooks(version.extensions))
  );
  return {
    fields,
    currentFields: () =>
      canPrepareRustSnapshotVersion(version)
        ? projectRustSnapshotFields({
            ...captureVersionSerializationPrefix(version),
            extensions: version.extensions,
            ...tail(version),
          })
        : undefined,
    canonicalObject: () => canonical,
  };
}
