import fs from 'fs-extra';

const systemFiles = ['.DS_Store'];

export async function readDirIgnoreSystemFiles(dirPath: string): Promise<string[]> {
  const files = await fs.readdir(dirPath);
  return files.filter((file) => !systemFiles.includes(file));
}

export function readDirIgnoreSystemFilesSync(dirPath: string): string[] {
  const files = fs.readdirSync(dirPath);
  return files.filter((file) => !systemFiles.includes(file));
}
