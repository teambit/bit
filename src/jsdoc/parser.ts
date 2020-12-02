import fs from 'fs-extra';
import { getDocsFromCache, saveDocsInCache } from '../consumer/component/component-fs-cache';
import { SourceFile } from '../consumer/component/sources';
import { getExt } from '../utils';
import { PathOsBased } from '../utils/path';
import jsDocParse from './jsdoc';
import reactParse from './react';
import { Doclet } from './types';
import vueParse from './vue';

export default async function parse(file: SourceFile): Promise<Doclet[]> {
  const docsFromCache = await getDocsFromCache(file.path);
  if (docsFromCache && docsFromCache.timestamp) {
    const stat = await fs.stat(file.path);
    const wasFileChanged = stat.mtimeMs > docsFromCache.timestamp;
    if (!wasFileChanged) {
      return JSON.parse(docsFromCache.data);
    }
  }

  const results = await parseFile(file.contents.toString(), file.relative);
  await saveDocsInCache(file.path, results);
  return results;
}

async function parseFile(data: string, filePath: PathOsBased): Promise<Doclet[]> {
  if (getExt(filePath) === 'vue') {
    return vueParse(data, filePath);
  }
  const reactDocs = await reactParse(data, filePath);
  if (reactDocs && Object.keys(reactDocs).length > 0) {
    return reactDocs;
  }
  return jsDocParse(data, filePath);
}
