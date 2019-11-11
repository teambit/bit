import { PathOsBased } from '../utils/path';
import { getExt } from '../utils';
import { Doclet } from './types';
import reactParse from './react';
import vueParse from './vue';

export default async function parse(data: string, filePath?: PathOsBased): Promise<Doclet | []> {
  if (filePath && getExt(filePath) === 'vue') {
    return vueParse(data, filePath);
  }
  return reactParse(data, filePath);
}
