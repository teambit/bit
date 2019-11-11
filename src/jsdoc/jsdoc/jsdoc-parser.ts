import doctrine from 'doctrine';
import exampleTagParser from '../example-tag-parser';
import { PathOsBased } from '../../utils/path';
import { pathNormalizeToLinux } from '../../utils';
import logger from '../../logger/logger';
import { Doclet } from '../types';

function formatTag(tag: Record<string, any>): Record<string, any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  delete tag.title;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!tag.type) return tag;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  let formattedType = doctrine.type.stringify(tag.type);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (tag.type.type === doctrine.type.Syntax.TypeApplication) {
    // Doctrine adds a dot after the generic type for historical reasons.
    // see here for more info: https://github.com/eslint/doctrine/issues/185
    formattedType = formattedType.replace('.<', '<');
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (tag.type.type === doctrine.type.Syntax.OptionalType) {
    // Doctrine shows an optional type with a suffix `=` (e.g. `string=`), we prefer the more
    // common syntax `?` (e.g. `string?`)
    formattedType = formattedType.replace('=', '?');
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  tag.type = formattedType;

  return tag;
}

function extractDataRegex(doc: string, doclets: Array<Doclet>, filePath: PathOsBased) {
  const commentsAst = doctrine.parse(doc.trim(), { unwrap: true, recoverable: true, sloppy: true });
  if (!commentsAst) return;

  const args = [];
  let description = commentsAst.description;
  let returns = {};
  let isStatic = false;
  let access = 'public';
  const examples = [];
  const properties = [];
  let name = '';
  let render = '';

  commentsAst.tags.forEach(tag => {
    switch (tag.title) {
      case 'desc':
      case 'description':
        description = tag.description;
        break;
      case 'name':
        name = tag.name;
        break;
      case 'param':
      case 'arg':
      case 'argument':
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        args.push(formatTag(tag));
        break;
      case 'returns':
      case 'return':
        returns = formatTag(tag);
        break;
      case 'static':
        isStatic = true;
        break;
      case 'private':
      case 'protected':
        access = tag.title;
        break;
      case 'access':
        access = tag.access;
        break;
      case 'example':
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        examples.push(exampleTagParser(tag.description));
        break;
      case 'property':
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        properties.push(formatTag(tag));
        break;
      case 'render':
        render = tag.description;
        break;
      default:
        break;
    }
  });

  const doclet: Doclet = {
    name, // todo: find the function/method name by regex
    description,
    args,
    returns,
    access,
    examples,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    render,
    properties,
    static: isStatic,
    filePath: pathNormalizeToLinux(filePath)
  };
  doclets.push(doclet);
}

export default async function parse(data: string, filePath?: PathOsBased): Promise<Doclet | []> {
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
    docs.forEach(doc => extractDataRegex(doc, doclets, filePath));
  } catch (e) {
    // never mind, ignore the doc of this source
    logger.debug(`failed parsing docs using on path ${filePath} with error`, e);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return doclets.filter(doclet => doclet.access === 'public');
}
