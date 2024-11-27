import { ComponentID, ComponentIdObj } from '@teambit/component-id';

type StashCompBase = { hash: string; isNew: boolean; bitmapEntry: Record<string, any> };
export type StashCompData = { id: ComponentID } & StashCompBase;
export type StashCompDataWithIdObj = { id: ComponentIdObj } & StashCompBase;
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
      stashCompsData: this.stashCompsData.map(({ id, hash, bitmapEntry, isNew }) => ({
        id: id.changeVersion(undefined).toObject(),
        hash,
        bitmapEntry,
        isNew,
      })),
    };
  }

  static async fromObject(obj: Record<string, any>): Promise<StashData> {
    const stashCompsData = await Promise.all(
      obj.stashCompsData.map(async (compData) => {
        const id = ComponentID.fromObject(compData.id);
        return {
          id,
          hash: compData.hash,
          bitmapEntry: compData.bitmapEntry,
          isNew: compData.isNew,
        };
      })
    );
    return new StashData(obj.metadata, stashCompsData);
  }
}
