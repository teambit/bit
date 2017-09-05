/** @flow */

export default function getWithoutExt(filename: string): string {
  // remove the extension
  return filename.substring(0, filename.lastIndexOf('.'));
}
