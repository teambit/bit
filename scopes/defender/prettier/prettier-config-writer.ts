import fs from 'fs-extra';
import { ExecutionContext } from '@teambit/envs';
import type {
  ConfigWriterEntry,
  ExtendingConfigFile,
  ConfigFile,
  GenerateExtendingConfigFilesArgs,
} from '@teambit/workspace-config-files';
import { FormatterMain } from '@teambit/formatter';
import { PrettierFormatterInterface } from './prettier-formatter-interface';

const CONFIG_NAME = '.prettierrc.cjs';
const BIT_GENERATED_PRETTIER_CONFIG_COMMENT = '// bit-generated-prettier-config';

export class PrettierConfigWriter implements ConfigWriterEntry {
  name = 'PrettierConfigWriter';
  cliName = 'prettier';

  constructor(private formatter: FormatterMain) {}
  patterns: string[] = [`**/${CONFIG_NAME}`];

  calcConfigFiles(executionContext: ExecutionContext): ConfigFile[] | undefined {
    const formatter = this.formatter.getFormatter(executionContext, {}) as PrettierFormatterInterface;
    if (!formatter) return undefined;
    if (!formatter.id.toLowerCase().includes('prettier')) return undefined;
    const config = formatter.generateIdeConfig?.();
    if (!config || !config.prettierConfig) return undefined;
    const content = `module.exports = ${JSON.stringify(config.prettierConfig, null, 2)}`;
    const prettierConfigFile = {
      content,
      name: '.prettierrc.bit.{hash}.cjs',
    };
    return [prettierConfigFile];
  }

  generateExtendingFile(args: GenerateExtendingConfigFilesArgs): ExtendingConfigFile | undefined {
    const { writtenConfigFiles } = args;
    const prettierConfigFile = writtenConfigFiles[0];
    // Using DSL to make sure it will be replaced with relative path
    const configContent = `module.exports = {
  ...require('{${prettierConfigFile.name}}')
}`;
    const content = `${BIT_GENERATED_PRETTIER_CONFIG_COMMENT}\n${configContent}`;
    return { content, name: CONFIG_NAME, extendingTarget: prettierConfigFile, useAbsPaths: false };
  }
  calcName(hash: string): string {
    return `.prettierrc.bit.${hash}.cjs`;
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_PRETTIER_CONFIG_COMMENT);
  }
}
