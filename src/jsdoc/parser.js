/** @Flow */
import doctrine from 'doctrine';
import exampleTagParser from './example-tag-parser';

export type Doclet = {
  name: string,
  description: string,
  args?: Array,
  returns?: Object,
  access?: string,
  examples?: Array,
  static?: Boolean
};

function formatTag(tag: Object): Object {
  delete tag.title;
  if (!tag.type) return tag;
  tag.type = doctrine.type.stringify(tag.type);
  
  return tag;
}

function extractDataRegex(doc: string, doclets: Array<Doclet>) {
  const commentsAst = doctrine.parse(doc.trim(), { unwrap: true, recoverable: true });
  if (!commentsAst) return;

  const args = [];
  const description = commentsAst.description;
  let returns = {};
  let isStatic = false;
  let access = 'public';
  let examples = [];
  let name = '';

  for (const tag of commentsAst.tags) {
    switch (tag.title) {
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
    }
  }

  const doclet = {
    name, // todo: find the function/method name by regex 
    description,
    args,
    returns,
    access,
    examples,
    static: isStatic,
  };
  doclets.push(doclet);
}

export default function parse(data: string): Doclet|[] {
  const doclets: Array<Doclet> = [];
  try {
    const jsdocRegex = /[ \t]*\/\*\*\s*\n([^*]*(\*[^/])?)*\*\//g;
    const docs = data.match(jsdocRegex);
    docs.map(doc => extractDataRegex(doc, doclets));
  } catch (e) {
    // never mind, ignore the doc of this source
  }
  
  return doclets;
}
