import { stringify, parse, assign } from 'comment-json';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { ExecutionContext } from '@teambit/envs';
import { basename, join } from 'path';
import type {
  ConfigWriterEntry,
  WrittenConfigFile,
  ExtendingConfigFile,
  ConfigFile,
  EnvMapValue,
  PostProcessExtendingConfigFilesArgs,
} from '@teambit/workspace-config-files';
import { CompilerMain } from '@teambit/compiler';
import { IdeConfig, TypescriptCompilerInterface } from './typescript-compiler-interface';
import { expandIncludeExclude } from './expand-include-exclude';

const CONFIG_NAME = 'tsconfig.json';
const BIT_GENERATED_TS_CONFIG_COMMENT = '// bit-generated-typescript-config';
const GLOBAL_TYPES_DIR = 'global-types';

export class TypescriptConfigWriter implements ConfigWriterEntry {
  name = 'TypescriptConfigWriter';
  cliName = 'ts';

  constructor(private compiler: CompilerMain) {}
  patterns: string[] = [`**/${CONFIG_NAME}`];

  calcConfigFiles(executionContext: ExecutionContext): ConfigFile[] | undefined {
    const compiler = this.compiler.getCompiler(executionContext) as TypescriptCompilerInterface;
    if (!compiler) return undefined;
    if (!compiler.id.toLowerCase().includes('typescript')) return undefined;
    const config = compiler.generateIdeConfig?.();
    if (!config || !config.tsconfig) return undefined;
    const tsConfigContent = JSON.stringify(config.tsconfig, null, 2);
    const tsConfigHash = sha1(tsConfigContent);
    const tsConfigName = `tsconfig.bit.${tsConfigHash}.json`;
    const typescriptConfigFile = {
      content: tsConfigContent,
      hash: tsConfigHash,
      name: tsConfigName,
    };
    const globalTypesConfigFiles = this.getGlobalTypesConfigFiles(config);
    return [typescriptConfigFile, ...globalTypesConfigFiles];
  }

  private getGlobalTypesConfigFiles(config: IdeConfig) {
    const files = config.globalTypesPaths.map((path) => {
      const content = fs.readFileSync(path).toString();
      const origName = basename(path);
      const nameWithHash = origName.replace(/\.d\.ts$/, '.{hash}.d.ts');
      const name = `${GLOBAL_TYPES_DIR}/${nameWithHash}`;
      return {
        content,
        name,
      };
    });
    return files;
  }

  async postProcessConfigFiles(
    writtenConfigFiles: WrittenConfigFile[],
    executionContext: ExecutionContext,
    envMapValue: EnvMapValue
  ): Promise<void> {
    const tsConfigFile = writtenConfigFiles.find((file) => file.name.includes('tsconfig.bit'));
    if (!tsConfigFile) return Promise.resolve();
    const tsConfigPath = tsConfigFile.filePath;
    const tsConfig = await fs.readJson(tsConfigPath);
    const compDirs: string[] = envMapValue.paths;

    const newTsConfig = expandIncludeExclude(tsConfigPath, tsConfig, compDirs);

    fs.outputJSONSync(tsConfigPath, newTsConfig, { spaces: 2 });
    return Promise.resolve();
  }

  generateExtendingFile(writtenConfigFiles: WrittenConfigFile[]): ExtendingConfigFile | undefined {
    const tsconfigFile = writtenConfigFiles.find((file) => file.name.includes('tsconfig.bit'));
    if (!tsconfigFile) return undefined;
    const config = {
      extends: tsconfigFile.filePath,
    };
    const content = `${BIT_GENERATED_TS_CONFIG_COMMENT}\n\n${JSON.stringify(config, null, 2)}`;
    return { content, name: 'tsconfig.json', extendingTarget: tsconfigFile.filePath };
  }

  async postProcessExtendingConfigFiles?(args: PostProcessExtendingConfigFilesArgs): Promise<void> {
    const { workspaceDir, configsRootDir } = args;
    const rootTsConfigPath = join(workspaceDir, 'tsconfig.json');
    const exists = await fs.pathExists(rootTsConfigPath);
    let tsConfig = {};
    if (exists) {
      const content = (await fs.readFile(rootTsConfigPath)).toString();
      tsConfig = parse(content);
    }
    // @ts-ignore
    const typeRoots = tsConfig.typeRoots || [];
    typeRoots.push(join(configsRootDir, GLOBAL_TYPES_DIR));
    assign(tsConfig, { typeRoots });
    await fs.outputFile(rootTsConfigPath, stringify(tsConfig, null, 2));
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_TS_CONFIG_COMMENT);
  }
}
