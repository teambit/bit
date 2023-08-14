import { getConsumerInfo } from '@teambit/legacy/dist/consumer';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import fs from 'fs-extra';
import { join } from 'path';

const FILES_TO_COPY = {
  'teambit.react/react': ['jest/jest.cjs.config.js'],
};

let wsRootDir: string;

async function loadWsRootDir() {
  const consumerInfo = await getConsumerInfo(process.cwd());
  if (!consumerInfo) throw new Error('unable to find consumer');
  wsRootDir = consumerInfo.path;
  return consumerInfo.path;
}

export async function copyFilesOfCoreAspects(bundleDir: string) {
  await loadWsRootDir();
  const coreAspectsIds = Object.keys(FILES_TO_COPY);
  const generateOneAspectP = coreAspectsIds.map((id) => {
    const packageName = getCoreAspectPackageName(id);
    const files = FILES_TO_COPY[id];
    return handleOneAspect(bundleDir, packageName, files);
  });
  return Promise.all(generateOneAspectP);
}

async function handleOneAspect(bundleDir: string, packageName: string, files: string[]) {
  const srcDir = join(wsRootDir, 'node_modules', packageName);
  const targetDir = join(bundleDir, 'node_modules', packageName);
  await Promise.all(
    files.map(async (file) => {
      return handleOneFile(srcDir, targetDir, file);
    })
  );
}

async function handleOneFile(srcDir: string, targetDir: string, file: string) {
  const srcPath = join(srcDir, file);
  const targetPath = join(targetDir, file);
  return fs.copy(srcPath, targetPath);
}
