import findRoot from 'find-root';
import { join } from 'path';
import { readFileSync } from 'fs';

export function isEsmModule(path: string) {
  try {
    if (path.endsWith('.mjs')) return true;
    const root = findRoot(path);
    const packageJsonString = readFileSync(join(root, 'package.json')).toString('utf-8');
    const packageJson = JSON.parse(packageJsonString);
    return packageJson.type === 'module';
  } catch {
    return false;
  }
}
