import { PathOsBased } from '../utils/path';
import { getExt } from '../utils';
import { Doclet } from './types';
import reactParse from './react';
import vueParse from './vue';
import jsDocParse from './jsdoc';

export default async function parse(data: string, filePath?: PathOsBased): Promise<Doclet | []> {
  if (filePath && getExt(filePath) === 'vue') {
    return vueParse(data, filePath);
  }
  const reactDocs: Doclet | [] = await reactParse(data, filePath);
  if (Object.keys(reactDocs).length > 0) {
    return reactDocs;
  }
  return jsDocParse(data, filePath);
}
