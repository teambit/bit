import normalize from 'normalize-path';
import format from 'string-format';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import fs from 'fs-extra';
import { dirname, join, relative } from 'path';
import pMapSeries from 'p-map-series';
import { compact } from 'lodash';
import { ExtendingConfigFile } from '../config-writer-entry';
import { DedupedPaths, dedupePaths } from '../dedup-paths';
import {
  EnvCompsDirsMap,
  EnvConfigWriterEntry,
  EnvMapValue,
  WriteConfigFilesOptions,
} from '../workspace-config-files.main.runtime';
import { WrittenConfigFile, WrittenRealConfigFilesByHash } from './real-config-files';

type EnvCalculatedExtendingConfigFile = {
  envId: string;
  extendingConfigFile: Required<ExtendingConfigFile>;
};
export type WrittenExtendingConfigFile = ExtendingConfigFile & {
  filePaths: string[];
};
export type EnvsWrittenExtendingConfigFile = { envIds: string[]; extendingConfigFile: WrittenExtendingConfigFile };
export type EnvsWrittenExtendingConfigFiles = Array<EnvsWrittenExtendingConfigFile>;
export type ExtendingConfigFilesMap = {
  [configFileHash: string]: {
    envIds: string[];
    extendingConfigFile: Required<ExtendingConfigFile>;
  };
};

export async function handleExtendingConfigFiles(
  envEntries: EnvConfigWriterEntry[],
  envCompsDirsMap: EnvCompsDirsMap,
  writtenRealConfigFiles: WrittenRealConfigFilesByHash,
  configsRootDir: string,
  componentsRootDir: string | undefined,
  workspaceDir: string,
  opts: WriteConfigFilesOptions
): Promise<EnvsWrittenExtendingConfigFiles> {
  const extendingConfigFilesMap = await buildExtendingConfigFilesMap(
    envEntries,
    writtenRealConfigFiles,
    envCompsDirsMap,
    configsRootDir,
    workspaceDir
  );
  const fileHashPerDedupedPaths = dedupePaths(extendingConfigFilesMap, envCompsDirsMap, componentsRootDir);
  await postProcessExtendingConfigFiles(
    envEntries,
    envCompsDirsMap,
    extendingConfigFilesMap,
    fileHashPerDedupedPaths,
    configsRootDir,
    workspaceDir
  );
  const envsWrittenExtendingConfigFiles = await writeExtendingConfigFiles(
    extendingConfigFilesMap,
    fileHashPerDedupedPaths,
    workspaceDir,
    opts
  );
  return envsWrittenExtendingConfigFiles;
}

async function buildExtendingConfigFilesMap(
  envEntries: EnvConfigWriterEntry[],
  writtenRealConfigFiles: WrittenRealConfigFilesByHash,
  envCompsDirsMap: EnvCompsDirsMap,
  configsRootDir: string,
  workspaceDir: string
): Promise<ExtendingConfigFilesMap> {
  const allEnvsCalculatedExtendingConfigFiles: EnvCalculatedExtendingConfigFile[] = compact(
    await pMapSeries(envEntries, async (envConfigFileEntry) => {
      const envMapVal = envCompsDirsMap[envConfigFileEntry.envId];
      const writtenConfigFilesForEnv: WrittenConfigFile[] = getEnvOnlyWrittenRealConfigFiles(
        envConfigFileEntry.envId,
        writtenRealConfigFiles
      );
      const extendingConfigFile = generateOneExtendingConfigFile(
        writtenConfigFilesForEnv,
        envConfigFileEntry,
        envMapVal,
        configsRootDir,
        workspaceDir
      );
      if (!extendingConfigFile) {
        return undefined;
      }
      return {
        envId: envConfigFileEntry.envId,
        extendingConfigFile,
      };
    })
  );
  const extendingConfigFilesMap: ExtendingConfigFilesMap = indexExtendingConfigFiles(
    allEnvsCalculatedExtendingConfigFiles
  );
  return extendingConfigFilesMap;
}

function getEnvOnlyWrittenRealConfigFiles(
  envId: string,
  writtenRealConfigFiles: WrittenRealConfigFilesByHash
): WrittenConfigFile[] {
  return Object.values(writtenRealConfigFiles).reduce((acc, { envIds, writtenRealConfigFile }) => {
    if (envIds.includes(envId)) {
      acc.push(writtenRealConfigFile);
    }
    return acc;
  }, [] as WrittenConfigFile[]);
}

function generateOneExtendingConfigFile(
  writtenConfigFiles: WrittenConfigFile[],
  envConfigFileEntry: EnvConfigWriterEntry,
  envMapValue: EnvMapValue,
  configsRootDir: string,
  workspaceDir: string
): Required<ExtendingConfigFile> | undefined {
  const { configWriter, executionContext } = envConfigFileEntry;
  const args = {
    workspaceDir,
    configsRootDir,
    writtenConfigFiles,
    executionContext,
    envMapValue,
  };
  const extendingConfigFile = configWriter.generateExtendingFile(args);
  if (!extendingConfigFile) return undefined;
  const hash = extendingConfigFile.hash || sha1(extendingConfigFile.content);
  return {
    ...extendingConfigFile,
    useAbsPaths: !!extendingConfigFile.useAbsPaths,
    hash,
  };
}

function indexExtendingConfigFiles(
  multiEnvCalculatedExtendingConfigFiles: EnvCalculatedExtendingConfigFile[]
): ExtendingConfigFilesMap {
  const mergedConfigFiles = multiEnvCalculatedExtendingConfigFiles.reduce(
    (acc, curr: EnvCalculatedExtendingConfigFile) => {
      const extendingConfigFile = curr.extendingConfigFile;
      const currentValue = acc[extendingConfigFile.hash];
      if (currentValue) {
        currentValue.envIds.push(curr.envId);
      } else {
        acc[extendingConfigFile.hash] = { envIds: [curr.envId], extendingConfigFile };
      }
      return acc;
    },
    {}
  );
  return mergedConfigFiles;
}

async function postProcessExtendingConfigFiles(
  envEntries: EnvConfigWriterEntry[],
  envCompsDirsMap: EnvCompsDirsMap,
  extendingConfigFilesMap: ExtendingConfigFilesMap,
  fileHashPerDedupedPaths: DedupedPaths,
  configsRootDir: string,
  workspaceDir: string
) {
  await pMapSeries(envEntries, async (envConfigFileEntry) => {
    const postProcessFunc = envConfigFileEntry.configWriter.postProcessExtendingConfigFiles;
    if (!postProcessFunc) {
      return undefined;
    }
    const envMapVal = envCompsDirsMap[envConfigFileEntry.envId];
    const extendingConfigFileEntry = Object.values(extendingConfigFilesMap).find((entry) => {
      return entry.envIds.includes(envConfigFileEntry.envId);
    });
    if (!extendingConfigFileEntry) {
      return undefined;
    }
    const dedupEntry = fileHashPerDedupedPaths.find((fileHashPerDedupedPath) => {
      return fileHashPerDedupedPath.fileHash === extendingConfigFileEntry.extendingConfigFile.hash;
    });
    if (!dedupEntry) {
      return undefined;
    }

    const postProcessRes = await postProcessFunc({
      configsRootDir,
      extendingConfigFile: extendingConfigFileEntry.extendingConfigFile,
      envMapValue: envMapVal,
      workspaceDir,
      paths: dedupEntry.paths,
      supportSpecificPathChange: true,
    });
    if (!postProcessRes) {
      return undefined;
    }
    if (typeof postProcessRes === 'string') {
      extendingConfigFileEntry.extendingConfigFile.content = postProcessRes;
      return undefined;
    }
    postProcessRes.forEach(({ path, content }) => {
      // Remove it from the current entry
      dedupEntry.paths = dedupEntry.paths.filter((currPath) => currPath !== path);
      const newHash = sha1(content);
      extendingConfigFilesMap[newHash] = JSON.parse(JSON.stringify(extendingConfigFileEntry));
      extendingConfigFilesMap[newHash].extendingConfigFile.content = content;
      const foundNewHash = fileHashPerDedupedPaths.find((entry) => entry.fileHash === newHash);
      if (foundNewHash) {
        foundNewHash.paths.push(path);
      } else {
        fileHashPerDedupedPaths.push({ fileHash: newHash, paths: [path] });
      }
    });
    return undefined;
  });
}

async function writeExtendingConfigFiles(
  extendingConfigFilesMap: ExtendingConfigFilesMap,
  fileHashPerDedupedPaths: DedupedPaths,
  workspaceDir: string,
  opts: WriteConfigFilesOptions
): Promise<EnvsWrittenExtendingConfigFiles> {
  const finalResult: EnvsWrittenExtendingConfigFiles = await Promise.all(
    fileHashPerDedupedPaths.map(async ({ fileHash, paths }) => {
      const envsConfigFile = extendingConfigFilesMap[fileHash];
      const configFile = envsConfigFile.extendingConfigFile;
      const hash = configFile.hash || sha1(configFile.content);
      const name = format(configFile.name, { hash });
      const writtenPaths = await Promise.all(
        paths.map(async (path) => {
          const filePath = join(workspaceDir, path, name);
          const targetPath = configFile.useAbsPaths
            ? configFile.extendingTarget.filePath
            : normalize(`./${relative(dirname(filePath), configFile.extendingTarget.filePath)}`);
          const content = configFile.content.replace(`{${configFile.extendingTarget.name}}`, targetPath);
          if (!opts.dryRun) {
            await fs.outputFile(filePath, content);
          }
          return filePath;
        })
      );
      const res: EnvsWrittenExtendingConfigFile = {
        envIds: envsConfigFile.envIds,
        extendingConfigFile: {
          name,
          hash,
          content: configFile.content,
          extendingTarget: configFile.extendingTarget,
          filePaths: writtenPaths,
        },
      };
      return res;
    })
  );
  return finalResult;
}
