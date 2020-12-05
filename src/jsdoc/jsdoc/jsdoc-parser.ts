import logger from '../../logger/logger';
import { PathOsBased } from '../../utils/path';
import extractDataRegex from '../extract-data-regex';
import { Doclet } from '../types';

export default async function parse(data: string, filePath: PathOsBased): Promise<Doclet[]> {
  const doclets: Array<Doclet> = [];
  try {
    /**
     * [ \t]*  => can start with any number of tabs
     * \/\*\*  => must start with exact `/**`
     * \s*     => may follow with any number of white spaces
     * [^*]*   => anything except star may repeat
     * ([^\*]|(\*(?!\/)))* => may follow with stars as long as there is no "/" after the star
     * \*\/ => must finish with a star and then \.
     * This was taken as a combination of:
     * https://stackoverflow.com/questions/35905181/regex-for-jsdoc-comments
     * https://github.com/neogeek/jsdoc-regex/blob/master/index.js
     */
    const jsdocRegex = /[ \t]*\/\*\*\s*\n([^*]|(\*(?!\/)))*\*\//g;
    const docs = data.match(jsdocRegex);
    // populate doclets array
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    docs.forEach((doc) => extractDataRegex(doc, doclets, filePath));
  } catch (e) {
    // never mind, ignore the doc of this source
    logger.trace(`failed parsing docs using on path ${filePath} with error`, e);
  }
  return doclets.filter((doclet) => doclet.access === 'public');
}
