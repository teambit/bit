import { ensureDirSync, writeFileSync } from 'fs-extra';
import { join } from 'path';

const content = `@teambit:registry=https://node-registry.bit.cloud`;

export function generateNpmrc(bundleDir: string) {
  ensureDirSync(bundleDir);
  const filePath = join(bundleDir, '.npmrc');
  writeFileSync(filePath, content);
}
