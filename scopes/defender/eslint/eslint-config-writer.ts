import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { ExecutionContext } from '@teambit/envs';
import type { ConfigWriterEntry, EnvMapValue, WrittenConfigFile, ExtendingConfigFile, ConfigFile } from '@teambit/workspace-config-files';
import { expandIncludeExclude } from '@teambit/typescript';
import { set } from 'lodash';
import { LinterMain } from '@teambit/linter';
import { EslintLinterInterface } from './eslint-linter-interface';

const BIT_GENERATED_ESLINT_CONFIG_COMMENT = '// bit-generated-eslint-config';

export class EslintConfigWriter implements ConfigWriterEntry {
  name = 'EslintConfigWriter';
  cliName = 'eslint';

  constructor(private linter: LinterMain) {}
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
    const tsConfig = await fs.readJson(tsConfigPath);
    const compDirs: string[] = envMapValue.paths;
    const newTsConfig = expandIncludeExclude(tsConfigPath, tsConfig, compDirs);

    fs.outputJSONSync(tsConfigPath, newTsConfig, { spaces: 2 });
    return Promise.resolve();
  }

  generateExtendingFile(writtenConfigFiles: WrittenConfigFile[]): ExtendingConfigFile | undefined {
    const eslintConfigFile = writtenConfigFiles.find((file) => file.name.includes('.eslintrc.bit'));
    if (!eslintConfigFile) return undefined;
    const config = {
      extends: [eslintConfigFile.filePath],
    };
    const content = `${BIT_GENERATED_ESLINT_CONFIG_COMMENT}\n${JSON.stringify(config, null, 2)}`;
    return { content, name: '.eslintrc.json', extendingTarget: eslintConfigFile.filePath};
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_ESLINT_CONFIG_COMMENT);
  }
}
