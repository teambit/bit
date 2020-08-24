import { getExt } from '../utils';
import { PathOsBased } from '../utils/path';
import jsDocParse from './jsdoc';
import reactParse from './react';
import { Doclet } from './types';
import vueParse from './vue';

export default async function parse(data: string, filePath?: PathOsBased): Promise<Doclet[]> {
  if (filePath && getExt(filePath) === 'vue') {
    return vueParse(data, filePath);
  }
  const reactDocs = await reactParse(data, filePath);
  if (reactDocs && Object.keys(reactDocs).length > 0) {
    return reactDocs;
  }
  return jsDocParse(data, filePath);
}
