import fs from 'fs-extra';

export default async function readDirIgnoreDsStore(dirPath: string): Promise<string[]> {
  const files = await fs.readdir(dirPath);
  return files.filter((file) => file !== '.DS_Store');
}

export function readDirSyncIgnoreDsStore(dirPath: string): string[] {
  const files = fs.readdirSync(dirPath);
  return files.filter((file) => file !== '.DS_Store');
}
