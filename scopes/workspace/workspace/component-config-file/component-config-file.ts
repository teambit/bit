import { ComponentID, AspectList, AspectEntry, ResolveComponentIdFunc } from '@teambit/component';
import { COMPONENT_CONFIG_FILE_NAME } from '@teambit/legacy/dist/constants';
import { ExtensionDataList, configEntryToDataEntry } from '@teambit/legacy/dist/consumer/config/extension-data';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import detectIndent from 'detect-indent';
import detectNewline from 'detect-newline';
import fs from 'fs-extra';
import path from 'path';
import stringifyPackage from 'stringify-package';
import { REMOVE_EXTENSION_SPECIAL_SIGN } from '@teambit/legacy/dist/consumer/config';
import { merge } from 'lodash';
import { AlreadyExistsError } from './exceptions';

interface ComponentConfigFileOptions {
  indent: number;
  newLine: '\r\n' | '\n' | undefined;
}

interface WriteConfigFileOptions {
  override?: boolean;
}

interface ComponentConfigFileJson {
  componentId: any;
  // TODO: think if we want to change it to aspects
  extensions: any;
  propagate: boolean;
  defaultScope?: string;
}

const DEFAULT_INDENT = 2;
const DEFAULT_NEWLINE = '\n';

export class ComponentConfigFile {
  constructor(
    public componentId: ComponentID,
    public aspects: AspectList,
    private componentDir: PathOsBasedAbsolute,
    public propagate: boolean = false,
    private options: ComponentConfigFileOptions = { indent: DEFAULT_INDENT, newLine: DEFAULT_NEWLINE },
    public defaultScope?: string
  ) {}

  static async load(
    componentDir: PathOsBasedAbsolute,
    aspectListFactory: (extensionDataList: ExtensionDataList) => Promise<AspectList>,
    outsideDefaultScope?: string
  ): Promise<ComponentConfigFile | undefined> {
    const filePath = ComponentConfigFile.composePath(componentDir);
    const isExist = await fs.pathExists(filePath);
    if (!isExist) {
      return undefined;
    }
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed: ComponentConfigFileJson = parseComponentJsonContent(content, componentDir);
    const indent = detectIndent(content).amount;
    const newLine = detectNewline(content);
    const componentId = ComponentID.fromObject(parsed.componentId, parsed.defaultScope || outsideDefaultScope);
    const aspects = await aspectListFactory(ExtensionDataList.fromConfigObject(parsed.extensions));

    return new ComponentConfigFile(
      componentId,
      aspects,
      componentDir,
      Boolean(parsed.propagate),
      { indent, newLine },
      parsed.defaultScope
    );
  }

  static composePath(componentRootFolder: string) {
    return path.join(componentRootFolder, COMPONENT_CONFIG_FILE_NAME);
  }

  async write(options: WriteConfigFileOptions = {}): Promise<void> {
    const json = this.toJson();
    const filePath = ComponentConfigFile.composePath(this.componentDir);
    const isExist = await fs.pathExists(filePath);
    if (isExist && !options.override) {
      throw new AlreadyExistsError(filePath);
    }
    return fs.writeJsonSync(filePath, json, { spaces: this.options.indent, EOL: this.options.newLine });
  }

  async addAspect(
    aspectId: string,
    config: any,
    resolveComponentId: ResolveComponentIdFunc,
    shouldMergeConfig = false
  ) {
    const existing = this.aspects.get(aspectId);

    if (existing) {
      const getNewConfig = () => {
        if (!shouldMergeConfig) return config;
        if (!config || config === '-') return config;
        if (!existing.config) return config;
        // @ts-ignore
        if (existing.config === '-') return config;
        return merge(existing.config, config);
      };
      existing.config = getNewConfig();
    } else {
      const aspectEntry = await this.aspectEntryFromConfigObject(aspectId, config, resolveComponentId);
      this.aspects.entries.push(aspectEntry);
    }
  }

  async removeAspect(aspectId: string, markWithMinusIfNotExist: boolean, resolveComponentId: ResolveComponentIdFunc) {
    const existing = this.aspects.get(aspectId);
    if (existing) {
      const aspectList = this.aspects.withoutEntries([aspectId]);
      this.aspects = aspectList;
    } else if (markWithMinusIfNotExist) {
      await this.addAspect(aspectId, REMOVE_EXTENSION_SPECIAL_SIGN, resolveComponentId);
    }
  }

  private async aspectEntryFromConfigObject(id: string, config: any, resolveComponentId: ResolveComponentIdFunc) {
    const aspectId = await resolveComponentId(id);
    const legacyEntry = configEntryToDataEntry(id, config);
    return new AspectEntry(aspectId, legacyEntry);
  }

  toJson(): ComponentConfigFileJson {
    return {
      componentId: this.componentId.toObject(),
      propagate: this.propagate,
      defaultScope: this.defaultScope,
      extensions: this.aspects.toConfigObject(),
    };
  }

  toString(): string {
    const json = this.toJson();
    return stringifyPackage(json, this.options.indent, this.options.newLine);
  }
}

function parseComponentJsonContent(str: string, dir: string) {
  try {
    return JSON.parse(str);
  } catch (err: any) {
    throw new Error(`failed parsing component.json file at ${dir}. original error: ${err.message}`);
  }
}
