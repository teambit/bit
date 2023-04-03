import { stringify, parse, assign } from 'comment-json';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { ExecutionContext } from '@teambit/envs';
import { basename, join, relative } from 'path';
import type {
  ConfigWriterEntry,
  WrittenConfigFile,
  ExtendingConfigFile,
  ConfigFile,
  EnvMapValue,
  PostProcessExtendingConfigFilesArgs,
  GenerateExtendingConfigFilesArgs,
} from '@teambit/workspace-config-files';
import { uniq } from 'lodash';
import { CompilerMain } from '@teambit/compiler';
import { Logger } from '@teambit/logger';
import { IdeConfig, TypescriptCompilerInterface } from './typescript-compiler-interface';
import { expandIncludeExclude } from './expand-include-exclude';

const CONFIG_NAME = 'tsconfig.json';
const BIT_GENERATED_TS_CONFIG_COMMENT = '// bit-generated-typescript-config';
export const GLOBAL_TYPES_DIR = 'global-types';

export class TypescriptConfigWriter implements ConfigWriterEntry {
  name = 'TypescriptConfigWriter';
  cliName = 'ts';

  constructor(private compiler: CompilerMain, private logger: Logger) {}
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
    const exists = await fs.pathExists(tsConfigPath);

    if (!exists) {
      this.logger.warn(
        `TypescriptConfigWriter, tsconfig file ${tsConfigPath} was not found for post process. if it is part of --dry-run, it is ok.`
      );
      return Promise.resolve();
    }
    const tsConfig = await fs.readJson(tsConfigPath);
    const compDirs: string[] = envMapValue.paths;

    const newTsConfig = expandIncludeExclude(tsConfigPath, tsConfig, compDirs, GLOBAL_TYPES_DIR);

    fs.outputJSONSync(tsConfigPath, newTsConfig, { spaces: 2 });
    return Promise.resolve();
  }

  generateExtendingFile(args: GenerateExtendingConfigFilesArgs): ExtendingConfigFile | undefined {
    const { writtenConfigFiles } = args;
    const tsconfigFile = writtenConfigFiles.find((file) => file.name.includes('tsconfig.bit'));
    if (!tsconfigFile) return undefined;
    const config = {
      // Using DSL to make sure it will be replaced with relative path
      extends: `{${tsconfigFile.name}}`,
    };
    const content = `${BIT_GENERATED_TS_CONFIG_COMMENT}\n\n${JSON.stringify(config, null, 2)}`;
    return { content, name: 'tsconfig.json', extendingTarget: tsconfigFile, useAbsPaths: false };
  }

  async postProcessExtendingConfigFiles?(args: PostProcessExtendingConfigFilesArgs): Promise<void> {
    if (!args.configsRootDir || args.dryRun) return;
    const { workspaceDir, configsRootDir } = args;
    const rootTsConfigPath = join(workspaceDir, 'tsconfig.json');
    const exists = await fs.pathExists(rootTsConfigPath);
    let tsConfig = {};
    if (exists) {
      const content = (await fs.readFile(rootTsConfigPath)).toString();
      tsConfig = parse(content);
    }
    // @ts-ignore
    const compilerOptions = tsConfig.compilerOptions || {};
    const typeRoots = compilerOptions.typeRoots || [];
    const globalTypesDir = join(configsRootDir, GLOBAL_TYPES_DIR);
    const relativeGlobalTypesDir = `./${relative(workspaceDir, globalTypesDir)}`;
    typeRoots.push(relativeGlobalTypesDir);
    typeRoots.push('./node_modules/@types');
    assign(compilerOptions, { typeRoots: uniq(typeRoots) });
    assign(tsConfig, { compilerOptions });
    await fs.outputFile(rootTsConfigPath, stringify(tsConfig, null, 2));
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_TS_CONFIG_COMMENT);
  }
}
