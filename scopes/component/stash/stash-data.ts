import { ComponentID, ComponentIdObj } from '@teambit/component-id';

export type StashCompData = { id: ComponentID; hash: string };
export type StashCompDataWithIdObj = { id: ComponentIdObj; hash: string };
export type StashMetadata = { message?: string };
export type StashDataObj = {
  metadata: StashMetadata;
  stashCompsData: StashCompDataWithIdObj[];
};

export class StashData {
  constructor(
    readonly metadata: StashMetadata,
    readonly stashCompsData: StashCompData[]
  ) {}

  toObject(): StashDataObj {
    return {
      metadata: this.metadata,
      stashCompsData: this.stashCompsData.map(({ id, hash }) => ({
        id: id.changeVersion(undefined).toObject(),
        hash,
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
        };
      })
    );
    return new StashData(obj.metadata, stashCompsData);
  }
}
