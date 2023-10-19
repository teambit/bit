import { ComponentID } from '@teambit/component-id';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { Workspace } from '@teambit/workspace';

export type StashCompData = { id: ComponentID; hash: Ref };
export type StashMetadata = { message?: string };

export class StashData {
  constructor(readonly metadata: StashMetadata, readonly stashCompsData: StashCompData[]) {}

  toObject() {
    return {
      metadata: this.metadata,
      stashCompsData: this.stashCompsData.map(({ id, hash }) => ({
        // id: { scope: id.scope, name: id.fullName },
        id: id.changeVersion(undefined).toObject(),
        hash: hash.toString(),
      })),
    };
  }

  static async fromObject(obj: Record<string, any>, workspace: Workspace): Promise<StashData> {
    const stashCompsData = await Promise.all(
      obj.stashCompsData.map(async (compData) => {
        const id = ComponentID.fromObject(compData.id);
        const resolved = await workspace.resolveComponentId(id);
        return {
          id: resolved,
          hash: Ref.from(compData.hash),
        };
      })
    );
    return new StashData(obj.metadata, stashCompsData);
  }
}
