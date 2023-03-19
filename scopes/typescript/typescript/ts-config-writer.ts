import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { ExecutionContext } from '@teambit/envs';
import type { ConfigWriterEntry, WrittenConfigFile, ExtendingConfigFile, ConfigFile, EnvMapValue } from '@teambit/workspace-config-files';
import { CompilerMain } from '@teambit/compiler';
import { TypescriptCompilerInterface } from './typescript-compiler-interface';
import { expandIncludeExclude } from './expand-include-exclude';

const CONFIG_NAME = 'tsconfig.json';
const BIT_GENERATED_TS_CONFIG_COMMENT = '// bit-generated-typescript-config';

export class TypescriptConfigWriter implements ConfigWriterEntry {
  name = 'TypescriptConfigWriter';

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
    return [typescriptConfigFile];
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
    return { content, name: 'tsconfig.json', extendingTarget: tsconfigFile.filePath};
  }

  isBitGenerated(filePath: string): boolean {
    const content = fs.readFileSync(filePath).toString();
    return content.includes(BIT_GENERATED_TS_CONFIG_COMMENT);
  }
}
