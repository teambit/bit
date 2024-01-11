import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { Ref } from '@teambit/legacy/dist/scope/objects';

export type StashCompData = { id: ComponentID; hash: Ref };
export type StashCompDataWithIdObj = { id: ComponentIdObj; hash: string };
export type StashMetadata = { message?: string };
export type StashDataObj = {
  metadata: StashMetadata;
  stashCompsData: StashCompDataWithIdObj[];
};

export class StashData {
  constructor(readonly metadata: StashMetadata, readonly stashCompsData: StashCompData[]) {}

  toObject(): StashDataObj {
    return {
      metadata: this.metadata,
      stashCompsData: this.stashCompsData.map(({ id, hash }) => ({
        // id: { scope: id.scope, name: id.fullName },
        id: id.changeVersion(undefined).toObject(),
        hash: hash.toString(),
      })),
    };
  }

  static async fromObject(obj: Record<string, any>): Promise<StashData> {
    const stashCompsData = await Promise.all(
      obj.stashCompsData.map(async (compData) => {
        const id = ComponentID.fromObject(compData.id);
        return {
          id,
          hash: Ref.from(compData.hash),
        };
      })
    );
    return new StashData(obj.metadata, stashCompsData);
  }
}
