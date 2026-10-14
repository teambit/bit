import { ComponentID } from '@teambit/component-id';
import type { RustWorkspaceInboundOptions } from './rust-workspace-inbound-options';

export type RustInboundReceipt = {
  token: string;
  owner: 'rust';
  importedIds: string[];
  progress: { reason: string | null; ids: string[]; components: number; objects: number; objectRequest?: boolean }[];
  importDetails: {
    id: string;
    versions: string[];
    latestVersion: string | null;
    status: 'added' | 'updated' | 'up to date';
    filesStatus: null;
    missingDeps: string[];
    deprecated: boolean;
    removed?: boolean;
  }[];
};

/** Validate the scalar receipt before publication or terminal output. */
export function validateRustInboundReceipt(value: any): RustInboundReceipt {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.token !== 'string' ||
    !value.token ||
    value.owner !== 'rust' ||
    !Array.isArray(value.importedIds) ||
    value.importedIds.length > 4096 ||
    !Array.isArray(value.progress) ||
    !Array.isArray(value.importDetails) ||
    value.importDetails.length !== value.importedIds.length
  )
    throw new Error('native inbound receipt');
  const imported = new Set<string>();
  for (const text of value.importedIds) {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('native inbound identity');
    const id = ComponentID.fromString(text);
    if (!id.scope || !id.version || !text.includes('@') || imported.has(id.toStringWithoutVersion()))
      throw new Error('native inbound identity');
    imported.add(id.toStringWithoutVersion());
  }
  const details = new Set<string>();
  for (const detail of value.importDetails) {
    if (
      !detail ||
      typeof detail.id !== 'string' ||
      detail.id.length > 4096 ||
      !imported.has(detail.id) ||
      details.has(detail.id) ||
      !Array.isArray(detail.versions) ||
      detail.versions.length > 4096 ||
      detail.versions.some((version: any) => typeof version !== 'string' || version.length > 256) ||
      !(detail.latestVersion === null || typeof detail.latestVersion === 'string') ||
      !['added', 'updated', 'up to date'].includes(detail.status) ||
      detail.filesStatus !== null ||
      !Array.isArray(detail.missingDeps) ||
      detail.missingDeps.length ||
      typeof detail.deprecated !== 'boolean' ||
      !(detail.removed === undefined || typeof detail.removed === 'boolean')
    )
      throw new Error('native inbound details');
    details.add(detail.id);
  }
  return value as RustInboundReceipt;
}

/** Keep terminal wording and color in the actual public commands. */
export async function formatRustWorkspaceInbound(value: RustInboundReceipt, options: RustWorkspaceInboundOptions) {
  const importedIds = value.importedIds.map((id) => ComponentID.fromString(id));
  const importDetails = value.importDetails.map((detail) => ({ ...detail, missingDeps: [] }));
  if (options.operation === 'fetch') {
    const { FetchCmd } = await import('@teambit/importer/dist/fetch-cmd.js');
    const command = new FetchCmd({ fetch: async () => ({ importedIds, importDetails }) } as any);
    return command.report([options.ids], { components: true, allHistory: options.allHistory });
  }
  const { ImportCmd } = await import('@teambit/importer/dist/import.cmd.js');
  const command = new ImportCmd({
    logger: { warn: () => undefined },
    import: async () => ({ importedIds, importDetails, importedDeps: [], missingIds: [] }),
  } as any);
  return command.report([options.ids], {
    objects: options.objectsOnly,
    allHistory: options.allHistory,
    skipDependencyInstallation: options.skipDependencyInstallation,
  });
}
