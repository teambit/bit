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
  resolved: boolean;
  remote?: string;
  lane: string;
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
      unmerged = fileContent.map((item) => ({ ...item, head: Ref.from(item.head) }));
    } catch (err) {
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

  getResolvedComponents() {
    return this.unmerged.filter((u) => u.resolved);
  }

  getUnresolvedComponents() {
    return this.unmerged.filter((u) => !u.resolved);
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
    return this.unmerged.map((item) => ({ ...item, head: item.head.toString() }));
  }

  static buildSnapMessage(unmergedComponent: UnmergedComponent): string {
    const remote = unmergedComponent.remote ? `remote ${unmergedComponent.remote}/` : '';
    return `merge ${remote}${unmergedComponent.lane}`;
  }
}
