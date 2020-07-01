import path from 'path';
import fs from 'fs-extra';
import detectIndent from 'detect-indent';
import detectNewline from 'detect-newline';
import stringifyPackage from 'stringify-package';
import { BitId } from '../../../bit-id';
import { ExtensionDataList } from '../../../consumer/config/extension-data';
import { COMPONENT_CONFIG_FILE_NAME } from '../../../constants';
import { PathOsBasedAbsolute, PathOsBased } from '../../../utils/path';

interface ComponentConfigFileOptions {
  indent: number;
  newLine: string;
}

const DEFAULT_INDENT = 2;
const DEFAULT_NEWLINE = '\n';

export class ComponentConfigFile {
  constructor(
    public componentId: BitId,
    public extensions: ExtensionDataList,
    public propagate: boolean = false,
    private options: ComponentConfigFileOptions = { indent: DEFAULT_INDENT, newLine: DEFAULT_NEWLINE }
  ) {}

  static async load(componentDir: PathOsBasedAbsolute): ComponentConfigFile {
    const filePath = composePath(componentDir);
    const content = await readFileIfExist(filePath);
    if (!content) {
      return new PackageJsonFile({ filePath, fileExist: false, workspaceDir });
    }
    const parsed = parseComponentJsonContent(content, componentDir);
    const indent = detectIndent(content).indent;
    const newline = detectNewline(content);
    const componentId = BitId.parse();

    return new ComponentConfigFile(componentId);
  }

  async write(componentDir: string): Promise<void> {}
}

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, COMPONENT_CONFIG_FILE_NAME);
}

async function parseComponentJsonContent(str: string, dir: string) {
  try {
    return JSON.parse(str);
  } catch (err) {
    throw new Error(`failed parsing component.json file at ${dir}. original error: ${err.message}`);
  }
}

async function readFileIfExist(filePath: PathOsBased) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // file not found
    }
    throw err;
  }
}
