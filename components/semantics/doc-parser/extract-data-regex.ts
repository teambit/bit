import doctrine from 'doctrine';

import type { PathOsBased } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import exampleTagParser from './example-tag-parser';
import type { Doclet, DocProp } from './types';
import type { Example } from './example-tag-parser';

type DocletWithRender = Doclet & { render: string };

function formatTag(tag: Record<string, any>): Record<string, any> {
  delete tag.title;
  if (!tag.type) return tag;
  let formattedType = doctrine.type.stringify(tag.type);
  if (tag.type.type === doctrine.type.Syntax.TypeApplication) {
    // Doctrine adds a dot after the generic type for historical reasons.
    // see here for more info: https://github.com/eslint/doctrine/issues/185
    formattedType = formattedType.replace('.<', '<');
  }
  if (tag.type.type === doctrine.type.Syntax.OptionalType) {
    // Doctrine shows an optional type with a suffix `=` (e.g. `string=`), we prefer the more
    // common syntax `?` (e.g. `string?`)
    formattedType = formattedType.replace('=', '?');
  }
  tag.type = formattedType;

  return tag;
}

export default function extractDataRegex(doc: string, doclets: Array<Doclet>, filePath?: PathOsBased, unwrap = true) {
  const commentsAst = doctrine.parse(doc.trim(), { unwrap, recoverable: true, sloppy: true });
  if (!commentsAst) return;

  const args: Record<string, any>[] = [];
  let description = commentsAst.description;
  let returns = {};
  let isStatic = false;
  let access = 'public';
  const examples: Example[] = [];
  const properties: DocProp[] = [];
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
        examples.push(exampleTagParser(tag.description));
        break;
      case 'property':
        properties.push(formatTag(tag) as DocProp);
        break;
      case 'render':
        render = tag.description;
        break;
      default:
        break;
    }
  });

  const doclet: DocletWithRender = {
    name, // todo: find the function/method name by regex
    description,
    args,
    returns,
    access,
    examples,
    render,
    properties,
    static: isStatic,
    filePath: pathNormalizeToLinux(filePath),
  };
  doclets.push(doclet);
}
