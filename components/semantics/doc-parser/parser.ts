import fs from 'fs-extra';
import type { FsCache } from '@teambit/workspace.modules.fs-cache';
import type { SourceFile } from '@teambit/component.sources';
import jsDocParse from './jsdoc';
import type { Doclet } from './types';

/**
 * `componentFsCache` caches the results per file path on the filesystem. without it (e.g. outside a workspace, where
 * the files are in memory), the file is always parsed.
 */
export default async function parse(file: SourceFile, componentFsCache?: FsCache): Promise<Doclet[]> {
  if (!componentFsCache) return parseFile(file.contents.toString(), file.relative);
  const docsFromCache = await componentFsCache.getDocsFromCache(file.path);
  if (docsFromCache && docsFromCache.timestamp) {
    const stat = await fs.stat(file.path);
    const wasFileChanged = stat.mtimeMs > docsFromCache.timestamp;
    if (!wasFileChanged) {
      return JSON.parse(docsFromCache.data);
    }
  }

  const results = await jsDocParse(file.contents.toString(), file.relative);
  await componentFsCache.saveDocsInCache(file.path, results);
  return results;
}
