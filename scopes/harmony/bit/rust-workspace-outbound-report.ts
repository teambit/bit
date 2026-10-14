import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { RustWorkspaceOutboundOptions } from './rust-workspace-outbound-options';

export type RustOutboundReceipt = {
  token: string;
  owner: 'rust';
  componentsIds: string[];
  newIdsOnRemote: string[];
  nonExistOnBitMap: string[];
  removedIds: string[];
  missingScope: string[];
  exportedLanes: [];
  rippleJobUrls: [];
};

/** The worker may return identities and status only, never model/object bodies. */
export function validateRustOutboundReceipt(value: any): RustOutboundReceipt {
  if (!value || typeof value !== 'object' || typeof value.token !== 'string' || !value.token || value.owner !== 'rust')
    throw new Error('native outbound receipt');
  for (const field of ['componentsIds', 'newIdsOnRemote', 'nonExistOnBitMap', 'removedIds', 'missingScope']) {
    const ids = value[field];
    if (!Array.isArray(ids) || ids.length > 4096) throw new Error('native outbound identities');
    for (const text of ids) {
      if (typeof text !== 'string' || text.length > 4096) throw new Error('native outbound identity');
      const id = ComponentID.fromString(text);
      if (!id.scope) throw new Error('native outbound identity');
    }
  }
  if (value.exportedLanes?.length !== 0 || value.rippleJobUrls?.length !== 0)
    throw new Error('native outbound unsupported receipt');
  const components = new Set(
    value.componentsIds.map((text: string) => ComponentID.fromString(text).toStringWithoutVersion())
  );
  if (components.size !== value.componentsIds.length) throw new Error('native outbound duplicate identity');
  if (value.componentsIds.some((text: string) => text.includes('@')))
    throw new Error('native outbound component identity');
  for (const text of value.newIdsOnRemote) {
    const id = ComponentID.fromString(text);
    if (!text.includes('@') || !id.version || !components.has(id.toStringWithoutVersion()))
      throw new Error('native outbound remote identity');
  }
  return value as RustOutboundReceipt;
}

/** Reuse the public command so terminal wording and colors remain identical. */
export async function formatRustWorkspaceOutbound(value: RustOutboundReceipt, options: RustWorkspaceOutboundOptions) {
  const { ExportCmd } = await import('@teambit/export/dist/export-cmd.js');
  const ids = (field: string[]) => field.map((text) => ComponentID.fromString(text));
  const result = {
    componentsIds: ids(value.componentsIds),
    newIdsOnRemote: ids(value.newIdsOnRemote),
    nonExistOnBitMap: ids(value.nonExistOnBitMap),
    removedIds: ComponentIdList.fromArray(ids(value.removedIds)),
    missingScope: ids(value.missingScope),
    exportedLanes: [],
    ejectResults: undefined,
    rippleJobs: [],
    rippleJobUrls: [],
  };
  const command = new ExportCmd({ export: async () => result } as any);
  return command.report([options.ids], { originDirectly: options.originDirectly });
}
