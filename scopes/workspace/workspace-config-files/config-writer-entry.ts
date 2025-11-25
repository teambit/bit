import type { Environment, ExecutionContext } from '@teambit/envs';
import type { EnvMapValue } from './workspace-config-files.main.runtime';
import type { WrittenConfigFile } from './writers';

export type ConfigFile = {
  /**
   * Name of the config file.
   * supports also using `{hash}` in the name, which will be replaced by the hash of the config file.
   */
  name: string;
  /**
   * Content of the config file.
   * I.E the content of the tsconfig.json file.
   */
  content: string;
  /**
   * Hash of the config file.
   */
  hash?: string;
};

export type ExtendingConfigFileAdditionalProp = {
  /**
   * the config file that this config file extends.
   */
  extendingTarget: WrittenConfigFile;

  /**
   * When replacing the config file name with the actual path of the config file, use absolute paths.
   */
  useAbsPaths?: boolean;
};

export type ExtendingConfigFile = ConfigFile & ExtendingConfigFileAdditionalProp;

export type PostProcessExtendingConfigFilesArgs = {
  workspaceDir: string;
  configsRootDir: string;
  extendingConfigFile: ExtendingConfigFile;
  /**
   * Paths that the file will be written to.
   */
  paths: string[];
  envMapValue: EnvMapValue;
  /**
   * This is a flag for backward compatibility
   * We used to return string from the post process, so old versions of bit only knows to handle string results
   * while in new version we support getting array of objects
   * we need to know if bit the user is using support the new format or not
   */
  supportSpecificPathChange?: boolean;
};

export type GenerateExtendingConfigFilesArgs = {
  workspaceDir: string;
  configsRootDir: string;
  writtenConfigFiles: WrittenConfigFile[];
  envMapValue: EnvMapValue;
};

export type PostProcessExtendingConfigFilesOneFile = {
  path: string;
  content: string;
};

export type MergeConfigFilesFunc = (configFile: ConfigFile, configFile2: ConfigFile) => string;
export interface ConfigWriterEntry {
  /**
   * Id is used for few things:
   * 1. merge/post process different configs files (from different envs) together.
   * 2. filter the config writer by the cli when using --writers flag.
   */
  id: string;

  /**
   * Name of the config writer.
   * used for outputs and logging.
   */
  name: string;

  /**
   * Get's the component env and return the config file content
   * for example the eslint config to tsconfig.
   * This also enable to return a hash of the config file, which will be used to determine if
   * 2 config files are the same.
   * If the hash is not provided, the content will be used as the hash.
   * This enables the specific config type to ignore specific fields when calculating the
   * hash in order to ignore theses fields when determining if 2 config files are the same.
   * The calc function also get the target directory of the config file (calculated by this aspect) as sometime there
   * is a need to change the config file content based on the target directory.
   * for example, change the includes/excludes paths to be relative to the target directory.
   * The calc can return undefined if the config file is not relevant for the component. or not supported by the subscriber.
   * for example if the component uses babel to compile, then tsconfig is not relevant.
   * @param env
   */
  calcConfigFiles(
    executionContext: ExecutionContext,
    env: Environment,
    dir: string,
    workspaceDir?: string
  ): ConfigFile[] | undefined;

  /**
   * Provide a function that knows how to merge 2 config files together.
   * This is used when 2 different envs generate the same config file hash.
   * sometime we want to merge the 2 config files together.
   * @param configFile
   * @param configFile2
   */
  mergeConfigFiles?: MergeConfigFilesFunc;

  /**
   * This will be used to generate an extending file content.
   * For example, the tsconfig.json file will extend the real tsconfig.{hash}.json file (that were coming from the env).
   * That way we can avoid writing the same config file multiple times.
   * It also reduces the risk of the user manually change the config file and then the changes will be lost.
   * This function support returning a file with content with a dsl using `{}` to replace the config file name.
   * for example:
   * content = `{
   *   "extends": {configFile.name},
   * }`
   */
  generateExtendingFile(args: GenerateExtendingConfigFilesArgs): ExtendingConfigFile | undefined;

  /**
   * This enables the writer to do some post processing after the extending config files were calculated and deduped.
   * this is important in case when we need to change a config file / extending config file after it was calculated
   * based on all the environments in the ws
   * or based on other config files that were written.
   * @param args
   */
  postProcessExtendingConfigFiles?(
    args: PostProcessExtendingConfigFilesArgs
  ): Promise<string | Array<PostProcessExtendingConfigFilesOneFile> | undefined>;

  /**
   * Find all the files that are relevant for the config type.
   * This is used to clean / delete these files
   * This should return an array of glob patterns (that will passed to the globby/minimatch library)
   * @param dir
   */
  patterns: string[];

  /**
   * A function to determine if a file was generated by bit.
   * This is useful to check if the config file was generated by bit to prevent delete user's file.
   * @param filePath
   * @returns
   */
  isBitGenerated?: (filePath: string) => boolean;
}
