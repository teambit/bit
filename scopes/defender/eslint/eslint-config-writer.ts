import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { ExecutionContext } from '@teambit/envs';
import type {
  ConfigWriterEntry,
  EnvMapValue,
  WrittenConfigFile,
  ExtendingConfigFile,
  ConfigFile,
  GenerateExtendingConfigFilesArgs,
} from '@teambit/workspace-config-files';
import { GLOBAL_TYPES_DIR, expandIncludeExclude } from '@teambit/typescript';
import { set } from 'lodash';
import { Logger } from '@teambit/logger';
import { LinterMain } from '@teambit/linter';
import { EslintLinterInterface } from './eslint-linter-interface';

const BIT_GENERATED_ESLINT_CONFIG_COMMENT = '// bit-generated-eslint-config';

export class EslintConfigWriter implements ConfigWriterEntry {
  name = 'EslintConfigWriter';
  cliName = 'eslint';

  constructor(private linter: LinterMain, private logger: Logger) {}
  patterns: string[] = ['**/.eslintrc.json'];

  calcConfigFiles(executionContext: ExecutionContext): ConfigFile[] | undefined {
    const linter = this.linter.getLinter(executionContext, {}) as EslintLinterInterface;
    if (!linter) return undefined;
    if (!linter.id.toLowerCase().includes('eslint')) return undefined;
    const config = linter.generateIdeConfig?.();
    if (!config || !config.eslintConfig) return undefined;
    const eslintConfigFile = {
      content: JSON.stringify(config.eslintConfig, null, 2),
      name: '.eslintrc.bit.{hash}.json',
    };
    if (!config.tsconfig) {
      return [eslintConfigFile];
    }
    const tsConfigContent = JSON.stringify(config.tsconfig, null, 2);
    const tsConfigHash = sha1(tsConfigContent);
    const tsConfigName = `tsconfig.bit.eslint.${tsConfigHash}.json`;
    const tsConfigFile = {
      content: tsConfigContent,
      hash: tsConfigHash,
      name: tsConfigName,
    };
    set(config.eslintConfig, 'parserOptions.project', tsConfigName);
    eslintConfigFile.content = JSON.stringify(config.eslintConfig, null, 2);
    return [eslintConfigFile, tsConfigFile];
  }

  async postProcessConfigFiles(
    writtenConfigFiles: WrittenConfigFile[],
    executionContext: ExecutionContext,
    envMapValue: EnvMapValue
  ): Promise<void> {
    const tsConfigFile = writtenConfigFiles.find((file) => file.name.includes('tsconfig.bit.eslint'));
    if (!tsConfigFile) return Promise.resolve();
    const tsConfigPath = tsConfigFile.filePath;
    const exists = await fs.pathExists(tsConfigPath);
    if (!exists) {
      this.logger.warn(
        `EslintConfigWriter, tsconfig file ${tsConfigPath} was not found for post process. if it is part of --dry-run, it is ok.`
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
    const eslintConfigFile = writtenConfigFiles.find((file) => file.name.includes('.eslintrc.bit'));
    if (!eslintConfigFile) return undefined;
    const config = {
      // Using DSL to make sure it will be replaced with relative path
      extends: [`{${eslintConfigFile.name}}`],
    };
    const content = `${BIT_GENERATED_ESLINT_CONFIG_COMMENT}\n${JSON.stringify(config, null, 2)}`;
    return { content, name: '.eslintrc.json', extendingTarget: eslintConfigFile, useAbsPaths: false };
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_ESLINT_CONFIG_COMMENT);
  }
}
