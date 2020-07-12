import path from 'path';
import fs from 'fs-extra';
import detectIndent from 'detect-indent';
import detectNewline from 'detect-newline';
import stringifyPackage from 'stringify-package';
import { BitId } from '../../../bit-id';
import { ExtensionDataList } from '../../../consumer/config/extension-data';
import { COMPONENT_CONFIG_FILE_NAME } from '../../../constants';
import { PathOsBasedAbsolute } from '../../../utils/path';
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
  extensions: any;
  propagate: boolean;
  defaultScope?: string;
}

const DEFAULT_INDENT = 2;
const DEFAULT_NEWLINE = '\n';

export class ComponentConfigFile {
  constructor(
    public componentId: BitId,
    public extensions: ExtensionDataList,
    public propagate: boolean = false,
    private options: ComponentConfigFileOptions = { indent: DEFAULT_INDENT, newLine: DEFAULT_NEWLINE },
    public defaultScope?: string
  ) {}

  // TODO: remove consumer from here
  static async load(componentDir: PathOsBasedAbsolute): Promise<ComponentConfigFile | undefined> {
    const filePath = ComponentConfigFile.composePath(componentDir);
    const isExist = await fs.pathExists(filePath);
    if (!isExist) {
      return undefined;
    }
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed: ComponentConfigFileJson = parseComponentJsonContent(content, componentDir);
    const indent = detectIndent(content).indent;
    const newLine = detectNewline(content);
    const componentId = new BitId(parsed.componentId);
    const extensions = ExtensionDataList.fromConfigObject(parsed.extensions);

    return new ComponentConfigFile(
      componentId,
      extensions,
      !!parsed.propagate,
      { indent, newLine },
      parsed.defaultScope
    );
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
      componentId: this.componentId.serialize(),
      propagate: this.propagate,
      defaultScope: this.defaultScope,
      extensions: this.extensions.toConfigObject()
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
