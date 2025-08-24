import fs from 'fs-extra';
import path from 'path';
import type { ComponentIdObj } from '@teambit/component-id';
import { ComponentID } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import { DEFAULT_LANE } from '@teambit/lane-id';
import type { Logger } from '@teambit/logger';

const STAGED_CONFIG_DIR = 'staged-config';

type Config = Record<string, any> | undefined;
type ComponentConfig = { id: ComponentID; config: Config; componentMapObject: Record<string, any> };
type ComponentConfigObj = { id: ComponentIdObj; config: Config; componentMapObject: Record<string, any> };

export class StagedConfig {
  hasChanged = false;
  constructor(
    readonly filePath: string,
    private componentsConfig: ComponentConfig[],
    private logger: Logger
  ) {}

  static async load(scopePath: string, logger: Logger, laneId?: LaneId): Promise<StagedConfig> {
    const lanePath = laneId ? path.join(laneId.scope, laneId.name) : DEFAULT_LANE;
    const filePath = path.join(scopePath, STAGED_CONFIG_DIR, `${lanePath}.json`);
    let componentsConfig: ComponentConfig[] = [];
    try {
      const fileContent = await fs.readJson(filePath);
      componentsConfig = fileContent.map((item) => ({ ...item, id: ComponentID.fromObject(item.id) }));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        componentsConfig = [];
      } else {
        throw err;
      }
    }
    return new StagedConfig(filePath, componentsConfig, logger);
  }

  toObject(): ComponentConfigObj[] {
    return this.componentsConfig.map(({ id, ...rest }) => ({ id: id.toObject(), ...rest }));
  }

  async write() {
    if (!this.hasChanged) return;
    await fs.outputFile(this.filePath, JSON.stringify(this.toObject(), null, 2));
  }

  getConfigPerId(id: ComponentID): Config {
    return this.componentsConfig.find((c) => c.id.isEqual(id, { ignoreVersion: true }))?.config;
  }

  getPerId(id: ComponentID): ComponentConfig | undefined {
    return this.componentsConfig.find((c) => c.id.isEqual(id, { ignoreVersion: true }));
  }

  getAll() {
    return this.componentsConfig;
  }

  isEmpty() {
    return this.componentsConfig.length === 0;
  }

  async deleteFile() {
    this.logger.debug(`staged-config, deleting ${this.filePath}`);
    await fs.remove(this.filePath);
    this.componentsConfig = [];
  }

  addComponentConfig(id: ComponentID, config: Config, componentMapObject: Record<string, any>) {
    const exists = this.componentsConfig.find((c) => c.id.isEqual(id, { ignoreVersion: true }));
    if (exists) {
      exists.config = config;
    } else {
      this.componentsConfig.push({ id, config, componentMapObject });
    }
    this.hasChanged = true;
  }

  removeComponentConfig(id: ComponentID) {
    const componentsConfigLengthBefore = this.componentsConfig.length;
    this.componentsConfig = this.componentsConfig.filter((c) => !c.id.isEqual(id, { ignoreVersion: true }));
    if (this.componentsConfig.length === componentsConfigLengthBefore) {
      this.logger.debug(`removeComponentConfig: unable to find ${id.toString()}`);
    } else {
      this.hasChanged = true;
    }
  }
}
