// @flow
import doctrine from 'doctrine';
import exampleTagParser from './example-tag-parser';
import type { PathLinux, PathOsBased } from '../utils/path';
import { pathNormalizeToLinux } from '../utils';

export type Doclet = {
  filePath: PathLinux,
  name: string,
  description: string,
  args?: Array,
  returns?: Object,
  access?: string,
  examples?: Array,
  properties?: Array,
  static?: Boolean
};

function formatTag(tag: Object): Object {
  delete tag.title;
  if (!tag.type) return tag;
  let formattedType = doctrine.type.stringify(tag.type);
  if (tag.type.type === doctrine.type.Syntax.TypeApplication) {
    // Doctrine adds a dot after the generic type for historical reasons.
    // see here for more info: https://github.com/eslint/doctrine/issues/185
    formattedType = formattedType.replace('.<', '<');
  }
  tag.type = formattedType;

  return tag;
}

function extractDataRegex(doc: string, doclets: Array<Doclet>, filePath: PathOsBased) {
  const commentsAst = doctrine.parse(doc.trim(), { unwrap: true, recoverable: true });
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
    render,
    properties,
    static: isStatic,
    filePath: pathNormalizeToLinux(filePath)
  };
  doclets.push(doclet);
}

export default function parse(data: string, filePath: PathOsBased): Doclet | [] {
  const doclets: Array<Doclet> = [];
  try {
    const jsdocRegex = /[ \t]*\/\*\*\s*\n([^*]*(\*[^/])?)*\*\//g;
    const docs = data.match(jsdocRegex);
    // populate doclets array
    docs.forEach(doc => extractDataRegex(doc, doclets, filePath));
  } catch (e) {
    // never mind, ignore the doc of this source
  }

  return doclets.filter(doclet => doclet.access === 'public');
}
