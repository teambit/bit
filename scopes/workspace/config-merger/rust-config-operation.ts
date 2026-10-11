import semver from 'semver';
import type * as Objects from '@teambit/objects';
import type * as Sources from '@teambit/component.sources';

export type SemverVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
};
export type SemverInput = {
  version?: SemverVersion;
  range?: Array<Array<{ operator: string; version?: SemverVersion }>>;
  minimum?: SemverVersion;
  minimumText?: string;
};
export type SemverInputs = Record<string, SemverInput>;

const semverNames = ['valid', 'validRange', 'minVersion', 'gt', 'satisfies', 'SemVer', 'Range', 'Comparator'] as const;
// Registration belongs to the canonical merger module, before an adapter reload can
// mistake a subsequently installed parser hook for the ordinary implementation.
// eslint-disable-next-line no-var
var defaults: Map<string, unknown> | undefined;
// eslint-disable-next-line no-var
var prototypeDefaults: Array<{ object: object; descriptors: PropertyDescriptorMap }> | undefined;
export function registerRustConfigSemver(): void {
  defaults ||= new Map(semverNames.map((name) => [name, semver[name]]));
  prototypeDefaults ||= [semver.SemVer.prototype, semver.Range.prototype, semver.Comparator.prototype].map(
    (object) => ({
      object,
      descriptors: Object.getOwnPropertyDescriptors(object),
    })
  );
}
export function eligibleSemverDefaults(): boolean {
  return Boolean(
    defaults &&
      semverNames.every((name) => Object.getOwnPropertyDescriptor(semver, name)?.value === defaults?.get(name)) &&
      prototypeDefaults?.every(({ object, descriptors }) => {
        const live = Object.getOwnPropertyDescriptors(object);
        return (
          Object.keys(live).length === Object.keys(descriptors).length &&
          Object.entries(descriptors).every(([key, original]) => {
            const current = live[key];
            return (
              current &&
              current.value === original.value &&
              current.get === original.get &&
              current.set === original.set
            );
          })
        );
      })
  );
}
function version(value: semver.SemVer): SemverVersion {
  return { major: value.major, minor: value.minor, patch: value.patch, prerelease: [...value.prerelease] };
}
/** npm parses its grammar here; the native operation evaluates all policy decisions. */
export function normalizeSemverInputs(values: Iterable<string>): SemverInputs | undefined {
  if (!eligibleSemverDefaults()) return undefined;
  const result: SemverInputs = Object.create(null);
  const unique = new Set(values);
  if (unique.size > 4096) return undefined;
  let bytes = 0;
  for (const text of unique) {
    if (typeof text !== 'string' || text.length > 4096) return undefined;
    bytes += Buffer.byteLength(text);
    if (bytes > 4 * 1024 * 1024) return undefined;
  }
  try {
    for (const text of unique) {
      if (typeof text !== 'string' || text.length > 4096) return undefined;
      const input: SemverInput = {};
      if (semver.valid(text)) input.version = version(new semver.SemVer(text));
      if (semver.validRange(text)) {
        input.range = new semver.Range(text).set.map((set) =>
          set.map((comparator) => ({
            operator: comparator.operator,
            ...(comparator.value ? { version: version(comparator.semver) } : {}),
          }))
        );
        const minimum = semver.minVersion(text);
        if (minimum) {
          input.minimum = version(minimum);
          input.minimumText = minimum.toString();
        }
      }
      result[text] = input;
    }
  } catch {
    return undefined;
  }
  return eligibleSemverDefaults() ? result : undefined;
}

export function isRustConfigOperation(): boolean {
  // Keep the canonical synchronous merger independent of the cyclic scope graph.
  const { isRustSnapshotOperation } = require('@teambit/objects') as typeof Objects;
  return isRustSnapshotOperation();
}
export async function requestRustConfig<T>(
  input: object,
  validate: (data: any) => boolean,
  retainSession?: (dispose: () => Promise<void>) => void
): Promise<T | undefined> {
  if (!isRustConfigOperation()) return undefined;
  const { withWorkspaceSession } = require('@teambit/component.sources') as typeof Sources;
  const bytes = Buffer.from(JSON.stringify(input));
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) return undefined;
  return withWorkspaceSession(async (session) => {
    let result: T | undefined;
    let failed = false;
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        failed = response.failed;
        if (failed) return response.completed === 0 && response.data === undefined;
        if (response.completed !== 1 || !response.data || !validate(response.data)) return false;
        result = response.data as T;
        return true;
      },
      4 * 1024 * 1024
    );
    if (failed || result === undefined) await session.dispose();
    else retainSession?.(() => session.dispose());
    return result;
  });
}
