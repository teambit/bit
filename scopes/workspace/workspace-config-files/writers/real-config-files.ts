import format from 'string-format';
import { sha1 } from '@teambit/legacy.utils';
import fs from 'fs-extra';
import { join } from 'path';
import pMapSeries from 'p-map-series';
import { compact } from 'lodash';
import { ConfigFile, MergeConfigFilesFunc } from '../config-writer-entry';
import {
  EnvCompsDirsMap,
  EnvConfigWriterEntry,
  EnvMapValue,
  WriteConfigFilesOptions,
} from '../workspace-config-files.main.runtime';

type MergedRealConfigFilesByHash = {
  [hash: string]: {
    envIds: string[];
    realConfigFile: Required<ConfigFile>;
  };
};

export type EnvsWrittenRealConfigFiles = Array<EnvsWrittenRealConfigFile>;

export type EnvsWrittenRealConfigFile = {
  envIds: string[];
  writtenRealConfigFile: WrittenConfigFile;
};

export type WrittenRealConfigFilesByHash = {
  [hash: string]: EnvsWrittenRealConfigFile;
};

export type WrittenConfigFile = Required<ConfigFile> & {
  filePath: string;
};

type EnvCalculatedRealConfigFiles = {
  envId: string;
  realConfigFiles: Required<ConfigFile>[];
};

export async function handleRealConfigFiles(
  envEntries: EnvConfigWriterEntry[],
  envCompsDirsMap: EnvCompsDirsMap,
  configsRootDir: string,
  workspaceDir: string,
  opts: WriteConfigFilesOptions
): Promise<WrittenRealConfigFilesByHash> {
  const allEnvsCalculatedRealConfigFiles: EnvCalculatedRealConfigFiles[] = await pMapSeries(
    envEntries,
    async (envConfigFileEntry) => {
      const envMapVal = envCompsDirsMap[envConfigFileEntry.envId];
      const realConfigFiles = await calculateOneEnvRealConfigFiles(
        envConfigFileEntry,
        envMapVal,
        configsRootDir,
        workspaceDir
      );
      const realConfigFilesWithHash = ensureHashOnConfigFiles(compact(realConfigFiles));
      return {
        envId: envConfigFileEntry.envId,
        realConfigFiles: realConfigFilesWithHash,
      };
    }
  );
  // Find the first merge function exists
  const mergeFunc = envEntries.find((envEntry) => !!envEntry.configWriter.mergeConfigFiles)?.configWriter
    .mergeConfigFiles;
  const mergedRealConfigFiles = mergeRealConfigFiles(allEnvsCalculatedRealConfigFiles, mergeFunc);
  const writtenConfigFilesMap: WrittenRealConfigFilesByHash = {};
  await Promise.all(
    Object.entries(mergedRealConfigFiles).map(async ([hash, { envIds, realConfigFile }]) => {
      const writtenRealConfigFile = await writeConfigFile(realConfigFile, configsRootDir, opts);
      writtenConfigFilesMap[hash] = {
        envIds,
        writtenRealConfigFile,
      };
    })
  );

  return writtenConfigFilesMap;
}

function ensureHashOnConfigFiles(configFiles: ConfigFile[]): Array<Required<ConfigFile>> {
  return configFiles.map((configFile): Required<ConfigFile> => {
    if (!configFile.hash) {
      const hash = sha1(configFile.content);
      return { ...configFile, hash };
    }
    return configFile as Required<ConfigFile>;
  });
}

async function calculateOneEnvRealConfigFiles(
  envConfigFileEntry: EnvConfigWriterEntry,
  envMapValue: EnvMapValue,
  configsRootDir: string,
  workspaceDir: string
) {
  const { configWriter, executionContext } = envConfigFileEntry;
  const calculatedConfigFiles = configWriter.calcConfigFiles(
    executionContext,
    envMapValue,
    configsRootDir,
    workspaceDir
  );
  return calculatedConfigFiles;
}

function mergeRealConfigFiles(
  multiEnvCalculatedRealConfigFiles: EnvCalculatedRealConfigFiles[],
  mergeFunc?: MergeConfigFilesFunc
): MergedRealConfigFilesByHash {
  const mergedConfigFiles = multiEnvCalculatedRealConfigFiles.reduce((acc, curr: EnvCalculatedRealConfigFiles) => {
    curr.realConfigFiles.forEach((realConfigFile) => {
      const currentValue = acc[realConfigFile.hash];
      if (currentValue) {
        currentValue.envIds.push(curr.envId);
        if (currentValue && mergeFunc) {
          const mergedConfigFileContent = mergeFunc(currentValue.realConfigFile, realConfigFile);
          currentValue.realConfigFile.content = mergedConfigFileContent;
          realConfigFile.content = mergedConfigFileContent;
          acc[realConfigFile.hash].realConfigFile = realConfigFile;
        }
      } else {
        acc[realConfigFile.hash] = { envIds: [curr.envId], realConfigFile };
      }
    });
    return acc;
  }, {});
  return mergedConfigFiles;
}

async function writeConfigFile(
  configFile: ConfigFile,
  configsRootDir: string,
  opts: WriteConfigFilesOptions
): Promise<WrittenConfigFile> {
  const hash = configFile.hash || sha1(configFile.content);
  const name = format(configFile.name, { hash });
  const filePath = join(configsRootDir, name);
  if (!opts.dryRun) {
    // const exists = await fs.pathExists(filePath);
    // if (!exists) {
    await fs.outputFile(filePath, configFile.content);
    // }
  }
  const res = {
    name,
    hash,
    filePath,
    content: configFile.content,
  };
  return res;
}
