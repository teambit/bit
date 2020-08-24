import doctrine from 'doctrine';

import { pathNormalizeToLinux } from '../utils';
import { PathOsBased } from '../utils/path';
import exampleTagParser from './example-tag-parser';
import { Doclet } from './types';

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

export default function extractDataRegex(doc: string, doclets: Array<Doclet>, filePath?: PathOsBased, unwrap = true) {
  const commentsAst = doctrine.parse(doc.trim(), { unwrap, recoverable: true, sloppy: true });
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

  commentsAst.tags.forEach((tag) => {
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
    filePath: pathNormalizeToLinux(filePath),
  };
  doclets.push(doclet);
}
