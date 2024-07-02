import { join } from 'path';
import globby from 'globby';

const D_TS_PATTERN = '**/*.d.ts';

function getTypesFilesFromDir(dir: string): string[] {
  const files = globby.sync([D_TS_PATTERN], {
    cwd: dir,
    onlyFiles: true,
  });
  return files.map((file) => join(dir, file));
}

export function resolveTypes(rootDir: string, typesDirs: string[]): string[] {
  const resolved = typesDirs.flatMap((typesDir) => {
    const dir = join(rootDir, typesDir);
    return getTypesFilesFromDir(dir);
  });
  return resolved;
}
