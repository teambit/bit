/**
 * replace \ with \\ in a path to make it windows compatibale
 * for example replace
 * from c:\my-folder\my-file with
 * from c:\\my-folder\\my-file
 */
export function toWindowsCompatiblePath(path: string): string {
  return path.replace(/\\/g, '\\\\');
}
