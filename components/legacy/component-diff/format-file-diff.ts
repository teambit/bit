import type { PathOsBased } from '@teambit/toolbox.path.path';
import { diffFiles } from './diff-files';

export async function getOneFileDiff(
  filePathA: PathOsBased,
  filePathB: PathOsBased,
  fileALabel: string,
  fileBLabel: string,
  fileOrFieldName: string,
  color = true
): Promise<string> {
  const fileDiff = await diffFiles(filePathA, filePathB, color);
  return formatFileDiff(fileDiff, fileALabel, fileBLabel, fileOrFieldName);
}

export function formatFileDiff(
  fileDiff: string,
  fileALabel: string,
  fileBLabel: string,
  fileOrFieldName: string
): string {
  if (!fileDiff) return '';
  const diffStartsString = '--- '; // the part before this string is not needed for our purpose
  const diffStart = fileDiff.indexOf(diffStartsString);
  if (!diffStart || diffStart < 1) return ''; // invalid diff

  // e.g. Linux: --- a/private/var/folders/z ... .js
  // Windows: --- "a/C:\\Users\\David\\AppData\\Local\\Temp\\bit ... .js
  const regExpA = /--- ["]?a.*\n/; // exact "---", follow by a or "a (for Windows) then \n
  const regExpB = /\+\+\+ ["]?b.*\n/; // exact "+++", follow by b or "b (for Windows) then \n
  return fileDiff
    .slice(diffStart)
    .replace(regExpA, `--- ${fileOrFieldName} (${fileALabel})\n`)
    .replace(regExpB, `+++ ${fileOrFieldName} (${fileBLabel})\n`);
}
