import chalk from 'chalk';
import tempy from 'tempy';
import { uniq } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { diffFiles } from './diff-files';
import { PathOsBased } from '@teambit/toolbox.path.path';
import { SourceFile } from '@teambit/component.sources';

export type DiffStatus = 'MODIFIED' | 'UNCHANGED' | 'NEW' | 'DELETED';

export type FileDiff = {
  filePath: string;
  diffOutput: string;
  status: DiffStatus;
  fromContent: string;
  toContent: string;
};
export type FieldsDiff = {
  fieldName: string;
  diffOutput: string;
};
export type DiffResults = {
  id: ComponentID;
  hasDiff: boolean;
  filesDiff?: FileDiff[];
  fieldsDiff?: FieldsDiff[] | null | undefined;
};

export type DiffOptions = {
  verbose?: boolean; // whether show internal components diff, such as sourceRelativePath
  formatDepsAsTable?: boolean; // show dependencies output as table
  color?: boolean; // pass this option to git to return a colorful diff, default = true.
};

export async function getOneFileDiff(
  filePathA: PathOsBased,
  filePathB: PathOsBased,
  fileALabel: string,
  fileBLabel: string,
  fileOrFieldName: string,
  color = true
): Promise<string> {
  const fileDiff = await diffFiles(filePathA, filePathB, color);
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

export async function getFilesDiff(
  filesA: SourceFile[],
  filesB: SourceFile[],
  filesAVersion: string,
  filesBVersion: string,
  fileNameAttribute = 'relative',
  color = true
): Promise<FileDiff[]> {
  const filesAPaths = filesA.map((f) => f[fileNameAttribute]);
  const filesBPaths = filesB.map((f) => f[fileNameAttribute]);
  const allPaths = uniq(filesAPaths.concat(filesBPaths));
  const fileALabel = filesAVersion === filesBVersion ? `${filesAVersion} original` : filesAVersion;
  const fileBLabel = filesAVersion === filesBVersion ? `${filesBVersion} modified` : filesBVersion;
  const filesDiffP = allPaths.map(async (relativePath) => {
    const getFileData = async (files: SourceFile[]): Promise<{ path: PathOsBased; content: string; hash?: string }> => {
      const file = files.find((f) => f[fileNameAttribute] === relativePath);
      const hash = file?.toSourceAsLinuxEOL().hash().hash;
      const content = file ? file.contents : '';
      const path = await tempy.write(content, { extension: 'js' });
      return { path, content: content.toString('utf-8'), hash };
    };
    const [
      { path: fileAPath, content: fileAContent, hash: fileAHash },
      { path: fileBPath, content: fileBContent, hash: fileBHash },
    ] = await Promise.all([getFileData(filesA), getFileData(filesB)]);

    // files are saved into the model with Linux EOL. if the current file has `/r/n` EOL, it'll show as modified
    // unexpectedly. calculating the hash of the file with Linux EOL solves this issue.
    const diffOutput =
      fileAHash === fileBHash
        ? ''
        : await getOneFileDiff(fileAPath, fileBPath, fileALabel, fileBLabel, relativePath, color);

    let status: DiffStatus = 'UNCHANGED';
    if (diffOutput && !fileAContent) status = 'NEW';
    else if (diffOutput && !fileBContent) status = 'DELETED';
    else if (diffOutput) status = 'MODIFIED';

    return { filePath: relativePath, diffOutput, status, fromContent: fileAContent, toContent: fileBContent };
  });
  return Promise.all(filesDiffP);
}

export function outputDiffResults(diffResults: DiffResults[]): string {
  return diffResults
    .map((diffResult) => {
      if (diffResult.hasDiff) {
        const titleStr = `showing diff for ${chalk.bold(diffResult.id.toStringWithoutVersion())}`;
        const titleSeparator = Array.from({ length: titleStr.length }).fill('-').join('');
        const title = chalk.cyan(`${titleSeparator}\n${titleStr}\n${titleSeparator}`);
        // @ts-ignore since hasDiff is true, filesDiff must be set
        const filesWithDiff = diffResult.filesDiff.filter((file) => file.diffOutput);
        const files = filesWithDiff.map((fileDiff) => fileDiff.diffOutput).join('\n');
        const fields = diffResult.fieldsDiff ? diffResult.fieldsDiff.map((field) => field.diffOutput).join('\n') : '';
        return `${title}\n${files}\n${fields}`;
      }
      return `no diff for ${chalk.bold(diffResult.id.toString())} (consider running with --verbose)`;
    })
    .join('\n\n');
}
