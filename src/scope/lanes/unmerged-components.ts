import { LaneId } from '@teambit/lane-id';
import fs from 'fs-extra';
import { compact } from 'lodash';
import path from 'path';
import R from 'ramda';

import { Ref } from '../objects';

export type UnmergedComponent = {
  id: {
    scope?: string;
    name: string;
  };
  head: Ref;
  unmergedPaths?: string[];
  /**
   * @deprecated use laneId.remote instead
   */
  remote?: string;
  /**
   * @deprecated use laneId.name instead
   */
  lane: string;
  /**
   * can be main as well
   */
  laneId: LaneId;
  /**
   * the head is coming from a component with the same and scope but has no snap in common
   */
  unrelated?: boolean;
};

const UNMERGED_FILENAME = 'unmerged.json';

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
    try {
      const fileContent = await fs.readJson(filePath);
      unmerged = fileContent.map((item) => ({
        ...item,
        head: Ref.from(item.head),
        laneId: item.laneId ? new LaneId(item.laneId) : undefined,
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
    const existingComponent = this.getEntry(unmergedComponent.id.name);
    if (existingComponent) {
      throw new Error(
        `unable to add an unmerged component, a component with the same name already exist. name ${existingComponent.id.name}, scope: ${existingComponent.id.scope}`
      );
    }
    this.unmerged.push(unmergedComponent);
    this.hasChanged = true;
  }

  getEntry(componentName: string): UnmergedComponent | undefined {
    return this.unmerged.find((u) => u.id.name === componentName);
  }

  getComponents() {
    return this.unmerged;
  }

  removeComponent(componentName: string): boolean {
    const found = this.getEntry(componentName);
    if (!found) return false;
    this.unmerged = R.without([found], this.unmerged);
    this.hasChanged = true;
    return true;
  }

  removeMultipleComponents(componentNames: string[]): boolean {
    const found = compact(componentNames.map((comp) => this.getEntry(comp)));
    if (!found.length) return false;
    this.unmerged = R.without(found, this.unmerged);
    this.hasChanged = true;
    return true;
  }

  async write() {
    if (!this.hasChanged) return;
    await fs.outputFile(this.filePath, JSON.stringify(this.toObject(), null, 2));
  }

  toObject() {
    return this.unmerged.map((item) => ({ ...item, head: item.head.toString(), laneId: item.laneId.toObject() }));
  }

  static buildSnapMessage(unmergedComponent: UnmergedComponent): string {
    return `merge ${unmergedComponent.laneId.toString()}`;
  }
}
