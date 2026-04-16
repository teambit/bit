import chalk from 'chalk';
import tempy from 'tempy';
import { uniq } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import { diffFiles } from './diff-files';
import type { PathOsBased } from '@teambit/toolbox.path.path';
import type { SourceFile } from '@teambit/component.sources';

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
  compareToParent?: boolean; // compare to the parent (previous) version
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

export type DiffOutputOptions = {
  /** show only file-content diffs, drop fieldsDiff (deps, configs, metadata) */
  filesOnly?: boolean;
  /** show only fieldsDiff, drop file-content diffs */
  configsOnly?: boolean;
  /** limit file diffs to these component-relative paths (exact match or suffix match) */
  files?: string[];
  /** summary: one line per changed file with status letter + path, one line per changed field */
  nameOnly?: boolean;
  /** like nameOnly but also shows +N -M line counts per file */
  stat?: boolean;
};

function matchesFileFilter(filePath: string, filters: string[]): boolean {
  return filters.some((f) => filePath === f || filePath.endsWith(f) || f.endsWith(filePath));
}

export function filterDiffResults(diffResults: DiffResults[], opts: DiffOutputOptions): DiffResults[] {
  const { filesOnly, configsOnly, files } = opts;
  const hasFileFilter = files && files.length > 0;
  if (!filesOnly && !configsOnly && !hasFileFilter) return diffResults;

  return diffResults.map((result) => {
    if (!result.hasDiff) return result;
    const filesDiff = configsOnly
      ? []
      : hasFileFilter
        ? (result.filesDiff || []).filter((fd) => matchesFileFilter(fd.filePath, files as string[]))
        : result.filesDiff;
    const fieldsDiff = filesOnly || hasFileFilter ? null : result.fieldsDiff;
    const hasDiff = Boolean((filesDiff && filesDiff.some((f) => f.diffOutput)) || (fieldsDiff && fieldsDiff.length));
    return { ...result, filesDiff, fieldsDiff, hasDiff };
  });
}

const STATUS_LETTER: Record<DiffStatus, string> = {
  MODIFIED: 'M',
  NEW: 'A',
  DELETED: 'D',
  UNCHANGED: ' ',
};

function countDiffLines(diffOutput: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diffOutput.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function formatComponentHeader(diffResult: DiffResults): string {
  return `showing diff for ${chalk.bold(diffResult.id.toStringWithoutVersion())}`;
}

export function outputDiffResultsNameOnly(diffResults: DiffResults[]): string {
  return diffResults
    .map((diffResult) => {
      if (!diffResult.hasDiff) {
        return `no diff for ${chalk.bold(diffResult.id.toString())}`;
      }
      const header = formatComponentHeader(diffResult);
      const fileLines = (diffResult.filesDiff || [])
        .filter((fd) => fd.diffOutput)
        .map((fd) => `${STATUS_LETTER[fd.status]} ${fd.filePath}`);
      const fieldLines = (diffResult.fieldsDiff || []).map((fd) => `F ${fd.fieldName}`);
      const lines = [...fileLines, ...fieldLines];
      if (!lines.length) return `${header}\n(no matching changes)`;
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}

export function outputDiffResultsStat(diffResults: DiffResults[]): string {
  return diffResults
    .map((diffResult) => {
      if (!diffResult.hasDiff) {
        return `no diff for ${chalk.bold(diffResult.id.toString())}`;
      }
      const header = formatComponentHeader(diffResult);
      const filesWithDiff = (diffResult.filesDiff || []).filter((fd) => fd.diffOutput);
      const pathWidth = filesWithDiff.reduce((max, fd) => Math.max(max, fd.filePath.length), 0);
      const fileLines = filesWithDiff.map((fd) => {
        const { additions, deletions } = countDiffLines(fd.diffOutput);
        const paddedPath = fd.filePath.padEnd(pathWidth);
        return `${STATUS_LETTER[fd.status]} ${paddedPath}  +${additions} -${deletions}`;
      });
      const fieldLines = (diffResult.fieldsDiff || []).map((fd) => `F ${fd.fieldName}`);
      const lines = [...fileLines, ...fieldLines];
      if (!lines.length) return `${header}\n(no matching changes)`;
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}

export function outputDiffResultsFormatted(diffResults: DiffResults[], opts: DiffOutputOptions = {}): string {
  const filtered = filterDiffResults(diffResults, opts);
  if (opts.nameOnly) return outputDiffResultsNameOnly(filtered);
  if (opts.stat) return outputDiffResultsStat(filtered);
  return outputDiffResults(filtered);
}
