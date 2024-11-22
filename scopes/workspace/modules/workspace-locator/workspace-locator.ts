import fs from 'fs-extra';
import * as pathlib from 'path';

import {
  BIT_GIT_DIR,
  BIT_HIDDEN_DIR,
  BIT_MAP,
  DOT_GIT_DIR,
  OLD_BIT_MAP,
  WORKSPACE_JSONC,
} from '@teambit/legacy/dist/constants';

export type WorkspaceInfo = {
  path: string;
  hasWorkspaceConfig: boolean;
  hasBitMap: boolean;
  hasScope: boolean;
};

function composeBitHiddenDirPath(path: string) {
  return pathlib.join(path, BIT_HIDDEN_DIR);
}

function composeBitGitHiddenDirPath(path: string) {
  return pathlib.join(path, DOT_GIT_DIR, BIT_GIT_DIR);
}

/**
 * determine whether given path has .bit
 */
export function pathHasLocalScope(path: string) {
  return fs.existsSync(composeBitHiddenDirPath(path));
}

/**
 * propagate from the given directory up to the root to find the consumer
 */
export async function getWorkspaceInfo(absPath: string): Promise<WorkspaceInfo | undefined> {
  const searchPaths = buildPropagationPaths();
  searchPaths.unshift(absPath);
  for (let i = 0; i < searchPaths.length; i += 1) {
    const path = searchPaths[i];
    const hasScope = await pathHasScopeDir(path); // eslint-disable-line no-await-in-loop
    const hasConsumerConfig = await pathHasConsumerConfig(path); // eslint-disable-line no-await-in-loop
    const hasBitMap = await pathHasBitMap(path); // eslint-disable-line no-await-in-loop
    const consumerExists = hasConsumerConfig || hasBitMap;
    if (consumerExists) {
      return {
        path,
        hasScope,
        hasWorkspaceConfig: hasConsumerConfig,
        hasBitMap,
      };
    }
  }
  return undefined;

  function buildPropagationPaths(): string[] {
    const paths: string[] = [];
    const pathParts = absPath.split(pathlib.sep);

    pathParts.forEach((val, index) => {
      const part = pathParts.slice(0, index).join('/');
      if (!part) return;
      paths.push(part);
    });

    return paths.reverse();
  }

  async function pathHasBitMap(path: string): Promise<boolean> {
    return (await fs.pathExists(pathlib.join(path, BIT_MAP))) || fs.pathExists(pathlib.join(path, OLD_BIT_MAP));
  }

  async function pathHasScopeDir(path: string): Promise<boolean> {
    return (await fs.pathExists(composeBitHiddenDirPath(path))) || fs.pathExists(composeBitGitHiddenDirPath(path));
  }

  async function pathHasConsumerConfig(path: string): Promise<boolean> {
    const wsPath = pathlib.join(path, WORKSPACE_JSONC);
    return fs.pathExists(wsPath);
  }
}
