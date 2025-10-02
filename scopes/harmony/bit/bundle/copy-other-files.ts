import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import fs from 'fs-extra';
import { basename, join } from 'path';
import globby from 'globby';

const PATTERNS_TO_COPY = ['node_modules/typescript/lib/*.d.ts'];

let wsRootDir: string;

async function loadWsRootDir() {
  const consumerInfo = await getWorkspaceInfo(process.cwd());
  if (!consumerInfo) throw new Error('unable to find consumer');
  wsRootDir = consumerInfo.path;
  return consumerInfo.path;
}

export async function copyOtherFiles(bundleDir: string) {
  await loadWsRootDir();
  const copyP = PATTERNS_TO_COPY.map((file) => {
    return handleOnePattern(wsRootDir, bundleDir, file);
  });
  return Promise.all(copyP);
}

async function handleOnePattern(srcDir: string, targetDir: string, pattern: string) {
  const files = await globby(pattern, { cwd: srcDir });
  return Promise.all(
    files.map((file) => {
      return handleOnePath(srcDir, targetDir, file);
    })
  );
}

async function handleOnePath(srcDir: string, targetDir: string, path: string) {
  const srcPath = join(srcDir, path);
  const targetPath = join(targetDir, basename(path));
  const exists = await fs.pathExists(targetPath);
  if (exists) {
    await fs.remove(targetPath);
  }
  return fs.copy(srcPath, targetPath, { dereference: true });
}
