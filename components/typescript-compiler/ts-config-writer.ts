import { TsConfigJson } from 'get-tsconfig';
import normalize from 'normalize-path';
import { stringify, parse, assign } from 'comment-json';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { ExecutionContext, EnvContext } from '@teambit/envs';
import { basename, join, resolve, relative, isAbsolute } from 'path';
import type {
  ConfigWriterHandler,
  ConfigWriterEntry,
  ExtendingConfigFile,
  ConfigFile,
  EnvMapValue,
  PostProcessExtendingConfigFilesArgs,
  GenerateExtendingConfigFilesArgs,
} from '@teambit/workspace-config-files';
import { uniq } from 'lodash';
import { Logger } from '@teambit/logger';
import { expandIncludeExclude } from './expand-include-exclude';
import { TypeScriptCompilerOptions } from './typescript-compiler-options';
import { computeTsConfig } from './get-ts-config';
import { resolveTypes } from './resolve-types';

const CONFIG_NAME = 'tsconfig.json';
const BIT_GENERATED_TS_CONFIG_COMMENT = '// bit-generated-typescript-config';
export const GLOBAL_TYPES_DIR = 'global-types';

export type TypescriptConfigWriterOptions = Pick<
  TypeScriptCompilerOptions,
  'tsconfig' | 'compilerOptions' | 'types'
> & {
  name?: string;
};

export class TypescriptConfigWriter implements ConfigWriterEntry {
  id = 'typescript';

  patterns: string[] = [`**/${CONFIG_NAME}`];

  constructor(
    readonly name: string,
    private tsconfig: Record<string, any>,
    private typesPaths: string[] = [],
    private logger: Logger
  ) {}

  // @ts-ignore - temporary until we released new bit version with https://github.com/teambit/bit/pull/8615
  calcConfigFiles(
    _executionContext: ExecutionContext,
    envMapValue: EnvMapValue,
    configsRootDir: string,
    workspaceDir: string
  ): ConfigFile[] | undefined {
    const tsConfigContent = JSON.stringify(this.tsconfig, null, 2);
    // It's important to calculate the hash before we call the expandIncludeExclude function
    // to make sure we get the same hash for the same config.
    // we will merge different include/exclude patterns to the same config file as part of the mergeConfigFiles
    // below
    const tsConfigHash = sha1(tsConfigContent);
    const tsConfigName = `tsconfig.bit.${tsConfigHash}.json`;
    const tsConfigPath = join(configsRootDir, tsConfigName);
    const tsConfigCloned = JSON.parse(tsConfigContent);
    const compDirs: string[] = envMapValue.paths;
    const newTsConfig = expandIncludeExclude(tsConfigPath, tsConfigCloned, compDirs, GLOBAL_TYPES_DIR);
    this.resolveCompilerOptions(newTsConfig, workspaceDir);
    this.addRootDir(newTsConfig, configsRootDir, workspaceDir);
    const newTsConfigContent = JSON.stringify(newTsConfig, null, 2);

    const typescriptConfigFile = {
      content: newTsConfigContent,
      hash: tsConfigHash,
      name: tsConfigName,
    };
    const globalTypesConfigFiles = this.getGlobalTypesConfigFiles(this.typesPaths);
    return [typescriptConfigFile, ...globalTypesConfigFiles];
  }

  private resolveCompilerOptions(tsConfig: TsConfigJson, workspaceDir: string) {
    if (tsConfig.compilerOptions && tsConfig.compilerOptions.types) {
      // eslint-disable-next-line no-param-reassign
      tsConfig.compilerOptions.types = tsConfig.compilerOptions.types.map((type) => {
        // absolute path
        if (isAbsolute(type)) return type;
        // relative path
        if (type[0] === '.') return resolve(workspaceDir, type);
        // node_modules
        return resolve(workspaceDir, 'node_modules', type);
      });
    }
  }

  private addRootDir(tsConfig: TsConfigJson, configsRootDir: string, workspaceDir?: string) {
    let wsDir = workspaceDir;
    const normalizedConfigRootDir = normalize(configsRootDir);
    if (!wsDir) {
      const nmIndex = normalizedConfigRootDir.indexOf('node_modules');
      if (nmIndex > -1) {
        wsDir = normalizedConfigRootDir.substring(0, nmIndex);
      }
    }
    if (!wsDir) return;
    const rootDir = normalize(relative(configsRootDir, wsDir));
    tsConfig.compilerOptions = tsConfig.compilerOptions || {};
    tsConfig.compilerOptions.rootDir = rootDir;
  }

  private getGlobalTypesConfigFiles(typesPaths: string[] = []) {
    const files = typesPaths.map((path) => {
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

  mergeConfigFiles?(configFile: ConfigFile, configFile2: ConfigFile): string {
    // Only merge tsconfig files (not global types for example)
    if (!configFile.name.includes('tsconfig.bit')) {
      return configFile.content;
    }
    const tsConfig1 = parse(configFile.content);
    const tsConfig2 = parse(configFile2.content);
    // @ts-ignore
    tsConfig1.include = uniq([...(tsConfig1?.include || []), ...(tsConfig2?.include || [])]).sort();
    // @ts-ignore
    tsConfig1.exclude = uniq([...(tsConfig1?.exclude || []), ...(tsConfig2?.exclude || [])]).sort();
    const content = stringify(tsConfig1, null, 2);
    return content;
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

  async postProcessExtendingConfigFiles?(args: PostProcessExtendingConfigFilesArgs): Promise<string | undefined> {
    // @ts-ignore - ignore here is for backward compatibility as supportSpecificPathChange didn't exist in the past
    const { workspaceDir, configsRootDir, paths, extendingConfigFile, supportSpecificPathChange } = args;
    // Only run for the root tsconfig.json
    if (!paths.find((path) => path === '.')) {
      return undefined;
    }
    const { content } = extendingConfigFile;
    const tsConfig = parse(content);
    // @ts-ignore
    const compilerOptions = tsConfig.compilerOptions || {};
    const typeRoots = compilerOptions.typeRoots || [];
    const globalTypesDir = join(configsRootDir, GLOBAL_TYPES_DIR);
    const relativeGlobalTypesDir = normalize(`./${relative(workspaceDir, globalTypesDir)}`);
    typeRoots.push(relativeGlobalTypesDir);
    typeRoots.push('./node_modules/@types');
    assign(compilerOptions, { typeRoots: uniq(typeRoots) });
    assign(tsConfig, { compilerOptions });
    const newContent = stringify(tsConfig, null, 2);
    if (supportSpecificPathChange) {
      // @ts-ignore - ignore here is for backward compatibility as this was invalid result type in old version
      return [
        {
          path: '.',
          content: newContent,
        },
      ];
    }
    // For backward compatibility
    return newContent;
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_TS_CONFIG_COMMENT);
  }

  static from(options: TypescriptConfigWriterOptions): ConfigWriterHandler {
    const name = options.name || 'TypescriptConfigWriter';
    const handler = (context: EnvContext) => {
      return TypescriptConfigWriter.create(options, context.createLogger(name));
    };
    return {
      name,
      // @ts-ignore - temporary until we released new bit version with https://github.com/teambit/bit/pull/8615
      handler,
    };
  }

  static create(options: TypescriptConfigWriterOptions, logger: Logger): TypescriptConfigWriter {
    const name = options.name || 'TypescriptConfigWriter';

    const rawTsConfig = computeTsConfig({
      tsconfig: options.tsconfig,
      compilerOptions: options.compilerOptions,
    });
    const types = options.types || resolveTypes(__dirname, ['global-types']);
    return new TypescriptConfigWriter(name, rawTsConfig, types, logger);
  }
}
