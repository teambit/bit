import fs from 'fs-extra';
import tempy from 'tempy';
import path from 'path';
import { createHash } from 'crypto';
import { WorkspaceConfig } from '@teambit/config';
import type { WorkspaceDepsConflicts } from '@teambit/component.modules.merge-helper';
import { canPlanWorkspaceConfig } from './rust-workspace-config';
import { requestRustConfig } from './rust-config-operation';

type Hooks = { fs: typeof fs; tempy: typeof tempy; mergeFiles: unknown };
// The canonical runtime registers readers before extensions can replace them.
// eslint-disable-next-line no-var
var defaults:
  | {
      read: unknown;
      write: unknown;
      remove: unknown;
      stat: unknown;
      temp: unknown;
      mergeFiles: unknown;
      path: PropertyDescriptor | undefined;
    }
  | undefined;
export function registerRustWorkspaceConflictHooks(hooks: Hooks): void {
  defaults ||= {
    read: hooks.fs.readFile,
    write: hooks.fs.writeFile,
    remove: hooks.fs.remove,
    stat: hooks.fs.stat,
    temp: hooks.tempy.write,
    mergeFiles: hooks.mergeFiles,
    path: Object.getOwnPropertyDescriptor(WorkspaceConfig.prototype, 'path'),
  };
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
/** Native success keeps JSONC bytes in Rust; recovery reuses its private candidate. */
export async function writeWorkspaceConflictsNatively(
  owner: object,
  workspaceConfig: WorkspaceConfig,
  conflicts: WorkspaceDepsConflicts,
  mergeFiles: unknown,
  writing: () => void
): Promise<boolean> {
  const eligible = () =>
    canPlanWorkspaceConfig(owner) &&
    defaults &&
    fs.readFile === defaults.read &&
    fs.writeFile === defaults.write &&
    fs.remove === defaults.remove &&
    fs.stat === defaults.stat &&
    tempy.write === defaults.temp &&
    mergeFiles === defaults.mergeFiles &&
    Object.getPrototypeOf(workspaceConfig) === WorkspaceConfig.prototype &&
    !Object.getOwnPropertyDescriptor(workspaceConfig, 'path') &&
    Object.getOwnPropertyDescriptor(WorkspaceConfig.prototype, 'path')?.get === defaults.path?.get;
  if (!eligible()) return false;
  const filename = Object.getOwnPropertyDescriptor(workspaceConfig, '_path')?.value;
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) return false;
  const before = snapshotConflicts(conflicts);
  if (!before) return false;
  const unchanged = () => {
    const after = snapshotConflicts(conflicts);
    return Boolean(
      after &&
        after.fingerprint === before.fingerprint &&
        after.references.length === before.references.length &&
        after.references.every((value, index) => value === before.references[index])
    );
  };
  let discardPlan: (() => Promise<void>) | undefined;
  const fallbackPath = await tempy.write('');
  try {
    if (!eligible() || !unchanged()) return false;
    const prepared = await requestRustConfig<{ ready: true; token: string; bytes: number; sha1: string }>(
      { kind: 'configWorkspaceConflictPlan', path: filename, fallbackPath, conflicts: before.ordered },
      (data) =>
        data.ready === true &&
        hash(data.token) &&
        hash(data.sha1) &&
        Number.isInteger(data.bytes) &&
        data.bytes > 0 &&
        data.bytes <= 32 * 1024 * 1024 &&
        unchanged(),
      (dispose) => {
        discardPlan = dispose;
      }
    );
    if (!prepared) return false;
    if (!eligible() || !unchanged()) {
      await discardPlan?.();
      return false;
    }
    const candidate = await fs.stat(fallbackPath);
    if (!candidate.isFile() || candidate.size !== prepared.bytes || !eligible() || !unchanged()) {
      await discardPlan?.();
      return false;
    }
    await workspaceConfig.backupConfigFile('before writing conflicts');
    writing();
    const committed = eligible()
      ? await requestRustConfig<{ saved: true }>(
          { kind: 'configWorkspaceConflictCommit', path: filename, token: prepared.token },
          (data) => data.saved === true
        )
      : undefined;
    if (!committed) {
      // A dead helper may have written a prefix. Replaying only this write keeps
      // the original prepared bytes and invokes the backup hook exactly once.
      const bytes = await fs.readFile(fallbackPath);
      if (bytes.length !== prepared.bytes || createHash('sha1').update(bytes).digest('hex') !== prepared.sha1) {
        throw new Error('workspace configuration conflict recovery candidate changed');
      }
      await fs.writeFile(filename, bytes);
    }
    return true;
  } finally {
    await fs.remove(fallbackPath);
  }
}

function snapshotConflicts(conflicts: WorkspaceDepsConflicts) {
  if (!conflicts || ![Object.prototype, null].includes(Object.getPrototypeOf(conflicts))) return undefined;
  const ordered: WorkspaceDepsConflicts = { dependencies: [], peerDependencies: [] };
  const references: object[] = [];
  for (const field of ['dependencies', 'peerDependencies'] as const) {
    const property = Object.getOwnPropertyDescriptor(conflicts, field);
    if (!property) {
      if (field in conflicts) return undefined;
      continue;
    }
    if (
      !('value' in property) ||
      !Array.isArray(property.value) ||
      Object.getPrototypeOf(property.value) !== Array.prototype ||
      property.value.length > 4096 ||
      Object.getOwnPropertySymbols(property.value).length ||
      Object.values(Object.getOwnPropertyDescriptors(property.value)).some((entry) => !('value' in entry))
    )
      return undefined;
    references.push(property.value);
    for (const entry of property.value) {
      if (
        !entry ||
        Object.getPrototypeOf(entry) !== Object.prototype ||
        Object.values(Object.getOwnPropertyDescriptors(entry)).some((value) => !('value' in value))
      )
        return undefined;
      const name = Object.getOwnPropertyDescriptor(entry, 'name')?.value;
      const version = Object.getOwnPropertyDescriptor(entry, 'version')?.value;
      if (typeof name !== 'string' || typeof version !== 'string') return undefined;
      references.push(entry);
      ordered[field]!.push({ name, version });
    }
  }
  return { ordered, references, fingerprint: JSON.stringify(ordered) };
}
