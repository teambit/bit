// @TODO refactor this file to include only exports
import * as eol from './eol';
import writeFile from './fs-write-file';
import { checksum, checksumFile } from './checksum';
import glob from './glob';
import { retrieveIgnoreList } from './ignore/ignore';
import immutableUnshift from './immutable-unshift';
import isBitUrl from './is-bit-url';
import isDir from './is-dir';
import isDirEmptySync from './is-dir-empty-sync';
import isRelativeImport from './is-relative-import';
import isValidPath from './is-valid-path';
import isNumeric from './number/is-numeric';
import cleanObject from './object-clean';
import objectToStringifiedTupleArray from './object-to-stringified-tuple-array';
import resolveHomePath from './os-resolve-home-path';
import prependBang from './prepend-bang';
import getLatestVersionNumber from './resolveLatestVersion';
import fromBase64 from './string/from-base64';
import getStringifyArgs from './string/get-stringify-args';
import removeChalkCharacters from './string/remove-chalk-characters';
import toBase64 from './string/to-base64';
import toBase64ArrayBuffer from './string/to-base64-array-buffer';
import deflate from './zlib-deflate';
import inflate from './zlib-inflate';

export {
  objectToStringifiedTupleArray,
  removeChalkCharacters,
  getStringifyArgs,
  isNumeric,
  inflate,
  deflate,
  toBase64,
  toBase64ArrayBuffer,
  fromBase64,
  glob,
  checksum,
  checksumFile,
  writeFile,
  cleanObject,
  prependBang,
  isBitUrl,
  isDir,
  resolveHomePath,
  isDirEmptySync,
  immutableUnshift,
  getLatestVersionNumber,
  retrieveIgnoreList,
  isValidPath,
  eol,
  isRelativeImport,
};

export { pMapPool } from './promise-with-concurrent';
export { ChownOptions } from './fs-write-file';
export { removeEmptyDir } from './fs/remove-empty-dir';
export { isBitIdMatchByWildcards } from './bit/is-bit-id-match-by-wildcards';
export {
  getLastModifiedPathsTimestampMs,
  getPathStatIfExist,
  getLastModifiedComponentTimestampMs,
} from './fs/last-modified';
export { resolvePackageData, ResolvedPackageData, resolvePackagePath, resolvePackageNameByPath } from './packages';
export { getLatestVersion, getValidVersionOrReleaseType, validateVersion } from './semver-helper';
export { removeFilesAndEmptyDirsRecursively } from './fs/remove-files-and-empty-dirs-recursively';
export { replacePlaceHolderForPackageValue } from './bit/component-placeholders';
export { parseScope } from './bit/parse-scope';
export { replacePackageName } from './string/replace-package-name';
export { hasWildcard } from './string/has-wildcard';
export { getGitExecutablePath } from './git/git-executable';
export { GitNotFound } from './git/exceptions/git-not-found';
export { BIT_IGNORE, getBitIgnoreFile, getGitIgnoreFile } from './ignore/ignore';
export { pipeOutput } from './child_process';
export {
  PathLinux,
  PathLinuxRelative,
  PathOsBased,
  PathOsBasedRelative,
  PathOsBasedAbsolute,
  PathAbsolute,
  PathLinuxAbsolute,
  PathRelative,
  removeFileExtension,
  pathJoinLinux,
  pathNormalizeToLinux,
  pathRelativeLinux,
  pathResolveToLinux,
} from '@teambit/toolbox.path.path';
