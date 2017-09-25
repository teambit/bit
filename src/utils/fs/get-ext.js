/** @flow */

export default function getExt(filename: string): string {
  // remove the extension
  return filename.substring(filename.lastIndexOf('.'), filename.length);
}
