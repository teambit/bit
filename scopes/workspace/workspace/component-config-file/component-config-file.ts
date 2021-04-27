import { ComponentID, AspectList } from '@teambit/component';
import { COMPONENT_CONFIG_FILE_NAME } from '@teambit/legacy/dist/constants';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import detectIndent from 'detect-indent';
import detectNewline from 'detect-newline';
import fs from 'fs-extra';
import path from 'path';
import stringifyPackage from 'stringify-package';

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
    public propagate: boolean = false,
    private options: ComponentConfigFileOptions = { indent: DEFAULT_INDENT, newLine: DEFAULT_NEWLINE },
    public defaultScope?: string
  ) {}

  // TODO: remove consumer from here
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

    return new ComponentConfigFile(componentId, aspects, !!parsed.propagate, { indent, newLine }, parsed.defaultScope);
  }

  static composePath(componentRootFolder: string) {
    return path.join(componentRootFolder, COMPONENT_CONFIG_FILE_NAME);
  }

  async write(componentDir: string, options: WriteConfigFileOptions = {}): Promise<void> {
    const json = this.toJson();
    const filePath = ComponentConfigFile.composePath(componentDir);
    const isExist = await fs.pathExists(filePath);
    if (isExist && !options.override) {
      throw new AlreadyExistsError(filePath);
    }
    return fs.writeJsonSync(filePath, json, { spaces: this.options.indent, EOL: this.options.newLine });
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
  } catch (err) {
    throw new Error(`failed parsing component.json file at ${dir}. original error: ${err.message}`);
  }
}
