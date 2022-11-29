import fs from 'fs-extra';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { Logger } from '@teambit/logger';

const STAGED_CONFIG_DIR = 'staged-config';

type Config = Record<string, any> | undefined;
type ComponentConfig = { id: ComponentID; config: Config };

export class StagedConfig {
  hasChanged = false;
  constructor(private filePath: string, private componentsConfig: ComponentConfig[], private logger: Logger) {}

  static async load(scopePath: string, logger: Logger, laneId?: LaneId): Promise<StagedConfig> {
    const lanePath = laneId ? path.join(laneId.scope, laneId.name) : DEFAULT_LANE;
    const filePath = path.join(scopePath, STAGED_CONFIG_DIR, `${lanePath}.json`);
    let componentsConfig: ComponentConfig[] = [];
    try {
      const fileContent = await fs.readJson(filePath);
      componentsConfig = fileContent.map((item) => ({ id: ComponentID.fromObject(item.id), config: item.config }));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        componentsConfig = [];
      } else {
        throw err;
      }
    }
    return new StagedConfig(filePath, componentsConfig, logger);
  }

  toObject() {
    return this.componentsConfig.map(({ id, config }) => ({ id: id.toObject(), config }));
  }

  async write() {
    if (!this.hasChanged) return;
    await fs.outputFile(this.filePath, JSON.stringify(this.toObject(), null, 2));
  }

  getConfigPerId(id: ComponentID): Config {
    return this.componentsConfig.find((c) => c.id.isEqual(id, { ignoreVersion: true }))?.config;
  }

  getAll() {
    return this.componentsConfig;
  }

  addComponentConfig(id: ComponentID, config: Config) {
    const exists = this.componentsConfig.find((c) => c.id.isEqual(id, { ignoreVersion: true }));
    if (exists) {
      exists.config = config;
    } else {
      this.componentsConfig.push({ id, config });
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
