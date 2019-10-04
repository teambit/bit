import getExt from './get-ext';

export default function getWithoutExt(filename: string): string {
  const ext = getExt(filename);
  // There is no extension just return the file name
  if (ext === filename) {
    return filename;
  }
  return filename.substring(0, filename.length - ext.length - 1); // -1 to remove the '.'
}
