import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import fs from 'fs-extra';
import { join } from 'path';

type Item = {
  paths: string[];
  targets: string[];
};

const FILES_TO_COPY = {
  'teambit.react/react': [
    {
      paths: ['jest'],
      // package - copy to "rootOutDir/node_modules/packageName"
      // configs-dir - "rootOutDir/bundle-dir/{scopeName}.{aspectName}"
      targets: ['package', 'configs-dir'],
    },
  ],
  'teambit.defender/jest': [
    {
      paths: ['dist/jest.worker.js', 'dist/jest.worker.js.map'],
      targets: ['configs-dir'],
    },
  ],
};

let wsRootDir: string;

async function loadWsRootDir() {
  const consumerInfo = await getWorkspaceInfo(process.cwd());
  if (!consumerInfo) throw new Error('unable to find consumer');
  wsRootDir = consumerInfo.path;
  return consumerInfo.path;
}

export async function copyFilesOfCoreAspects(rootOutDir: string, bundleDir: string) {
  await loadWsRootDir();
  const coreAspectsIds = Object.keys(FILES_TO_COPY);
  const generateOneAspectP = coreAspectsIds.map((id) => {
    const packageName = getCoreAspectPackageName(id);
    return handleOneAspect(id, rootOutDir, bundleDir, packageName);
  });
  return Promise.all(generateOneAspectP);
}

async function handleOneAspect(aspectId: string, rootOutDir: string, bundleDir: string, packageName: string) {
  const items = FILES_TO_COPY[aspectId];
  const srcDir = join(wsRootDir, 'node_modules', packageName);
  const packageTargetDir = join(rootOutDir, 'node_modules', packageName);
  const configDirName = getConfigDirName(aspectId);
  const configDirTargetDir = join(bundleDir, configDirName);
  await Promise.all(
    items.map(async (item) => {
      return handleOneItem(item, srcDir, packageTargetDir, configDirTargetDir);
    })
  );
}

function getConfigDirName(aspectId: string): string {
  const parts = aspectId.split('/');
  const [, scopeName] = parts[0].split('.');
  return `${scopeName}.${parts[1]}`;
}

async function handleOneItem(item: Item, srcDir: string, packageTargetDir: string, configDirTargetDir: string) {
  const { paths, targets } = item;
  const copyP = paths.flatMap((path) => {
    return targets.map((target) => {
      if (target === 'package') {
        return handleOnePath(srcDir, packageTargetDir, path);
      }
      if (target === 'configs-dir') {
        return handleOnePath(srcDir, configDirTargetDir, path);
      }
      return Promise.reject(new Error(`unknown target ${target}`));
    });
  });
  return Promise.all(copyP);
}

async function handleOnePath(srcDir: string, targetDir: string, path: string) {
  const srcPath = join(srcDir, path);
  const targetPath = join(targetDir, path);
  const exists = await fs.pathExists(targetPath);
  if (exists) {
    await fs.remove(targetPath);
  }
  return fs.copy(srcPath, targetPath, { dereference: true });
}
