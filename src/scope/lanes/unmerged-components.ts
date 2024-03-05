import { LaneId } from '@teambit/lane-id';
import fs from 'fs-extra';
import { compact } from 'lodash';
import path from 'path';
import R from 'ramda';
import { ComponentID } from '@teambit/component-id';
import { Ref } from '../objects';

export type UnmergedComponent = {
  id: {
    scope: string;
    name: string;
  };
  /**
   * the head of the other lane we merged from.
   * this head will be the second parent of the snap-merge.
   * an exception is when it's "unrelated", where it is using the unrelated props.
   */
  head: Ref;
  /**
   * not in use anymore
   */
  unmergedPaths?: string[];
  /**
   * can be main as well
   */
  laneId: LaneId;
  /**
   * before 0.2.33 this was boolean. now it's an object with more data.
   * it should be safe to remove the "boolean" around 11/2023
   */
  unrelated?:
    | boolean
    | {
        /**
         * this will be saved in the Version.unrelated.head
         */
        unrelatedHead: Ref;
        /**
         * this will be saved in the Version.unrelated.laneId
         */
        unrelatedLaneId: LaneId;
        /**
         * this will be the parent of the snap-merge.
         * (so basically, the history of the component is determined by this ref)
         */
        headOnCurrentLane: Ref;
      };
  /**
   * aspects config that were merged successfully
   */
  mergedConfig?: Record<string, any>;
};

export const UNMERGED_FILENAME = 'unmerged.json';

export default class UnmergedComponents {
  filePath: string;
  unmerged: UnmergedComponent[];
  hasChanged = false;
  constructor(filePath: string, unmerged: UnmergedComponent[]) {
    this.filePath = filePath;
    this.unmerged = unmerged;
  }
  static async load(scopePath: string): Promise<UnmergedComponents> {
    const filePath = path.join(scopePath, UNMERGED_FILENAME);
    let unmerged: UnmergedComponent[];
    const loadUnrelated = (item) => {
      if (item.unrelated === undefined) return undefined;
      if (typeof item.unrelated === 'boolean') return item.unrelated;
      return {
        unrelatedHead: Ref.from(item.unrelated.unrelatedHead),
        unrelatedLaneId: new LaneId(item.unrelated.unrelatedLaneId),
        headOnCurrentLane: Ref.from(item.unrelated.headOnCurrentLane),
      };
    };
    try {
      const fileContent = await fs.readJson(filePath);
      unmerged = fileContent.map((item) => ({
        ...item,
        head: Ref.from(item.head),
        laneId: item.laneId ? new LaneId(item.laneId) : undefined,
        unrelated: loadUnrelated(item),
      }));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        unmerged = [];
      } else {
        throw err;
      }
    }
    return new UnmergedComponents(filePath, unmerged);
  }
  addEntry(unmergedComponent: UnmergedComponent) {
    const existingComponent = this.getEntry(
      ComponentID.fromObject({ name: unmergedComponent.id.name, scope: unmergedComponent.id.scope })
    );
    if (existingComponent) {
      throw new Error(
        `unable to add an unmerged component, a component with the same name already exist. name ${existingComponent.id.name}, scope: ${existingComponent.id.scope}`
      );
    }
    this.unmerged.push(unmergedComponent);
    this.hasChanged = true;
  }

  getEntry(id: ComponentID): UnmergedComponent | undefined {
    return this.unmerged.find((u) => u.id.name === id.fullName && u.id.scope === id.scope);
  }

  getComponents() {
    return this.unmerged;
  }

  removeComponent(id: ComponentID): boolean {
    const found = this.getEntry(id);
    if (!found) return false;
    this.unmerged = R.without([found], this.unmerged);
    this.hasChanged = true;
    return true;
  }

  removeMultipleComponents(ids: ComponentID[]): boolean {
    const found = compact(ids.map((id) => this.getEntry(id)));
    if (!found.length) return false;
    this.unmerged = R.without(found, this.unmerged);
    this.hasChanged = true;
    return true;
  }

  removeAllComponents() {
    this.unmerged = [];
    this.hasChanged = true;
  }

  async write() {
    if (!this.hasChanged) return;
    await fs.outputFile(this.filePath, JSON.stringify(this.toObject(), null, 2));
  }

  toObject() {
    const getUnrelated = (item: UnmergedComponent) => {
      if (item.unrelated === undefined) return undefined;
      if (typeof item.unrelated === 'boolean') return item.unrelated;
      return {
        unrelatedHead: item.unrelated.unrelatedHead.toString(),
        unrelatedLaneId: item.unrelated.unrelatedLaneId.toObject(),
        headOnCurrentLane: item.unrelated.headOnCurrentLane.toString(),
      };
    };
    return this.unmerged.map((item) => ({
      ...item,
      head: item.head.toString(),
      laneId: item.laneId.toObject(),
      unrelated: getUnrelated(item),
    }));
  }

  static buildSnapMessage(unmergedComponent: UnmergedComponent): string {
    return `merge ${unmergedComponent.laneId.toString()}`;
  }
}
