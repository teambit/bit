/** @Flow */
import esprima from 'esprima';
import doctrine from 'doctrine';
import walk from 'esprima-walk';
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

function getFunctionName(node: Object): string {
  if (node.type === 'FunctionDeclaration') return node.id.name;
  if (node.type === 'ExpressionStatement') return node.expression.right.id.name;
  if (node.type === 'MethodDefinition') return node.key.name;
  if (node.type === 'VariableDeclaration') return node.declarations[0].id.name;
  throw new Error('The node is not recognized');
}

function formatTag(tag: Object): Object {
  delete tag.title;
  if (!tag.type) return tag;
  if (tag.type.name) tag.type = tag.type.name;
  else if (tag.type.type) tag.type = tag.type.type;
  return tag;
}

function getCommentsAST(node: Object): Object {
  const comment = node.leadingComments[node.leadingComments.length-1].value;
  return doctrine.parse(comment, { unwrap: true });
}

function isVariableDeclarationRelevant(node) {
  return (node.declarations
    && node.declarations.length
    && node.leadingComments
    && node.declarations[0].init
    && node.declarations[0].init.type
    && (node.declarations[0].init.type == 'FunctionExpression' || node.declarations[0].init.type == 'CallExpression')
  )
}

function handleFunctionType(node: Object): Doclet|null {
  if (node.type === 'ExpressionStatement'
    && (!node.expression.right || node.expression.right.type !== 'FunctionExpression')) return;
  if (node.type === 'VariableDeclaration' && !isVariableDeclarationRelevant(node)) return;

  const args = [];
  let description = '';
  let returns = {};
  let isStatic = false;
  let access = 'public';
  let examples = [];
  if (node.leadingComments && node.leadingComments.length) {
    const commentsAst = getCommentsAST(node);
    description = commentsAst.description;

    for (const tag of commentsAst.tags) {
      switch (tag.title) {
        case 'param':
          args.push(formatTag(tag));
          break;
        case 'returns':
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
  }

  const name = getFunctionName(node);
  return {
    name,
    description,
    args,
    returns,
    access,
    examples,
    static: isStatic,
  };
}

function handleClassType(node: Object): Doclet {
  let description = '';
  if (node.leadingComments && node.leadingComments.length) {
    const commentsAst = getCommentsAST(node);
    description = commentsAst.description;
  }
  return {
    name: node.id.name,
    description
  };
}

function extractData(node: Object, doclets: Array<Doclet>) {
  if (!node || !node.type) return;
  let doclet: Doclet;
  switch (node.type) {
    case 'FunctionDeclaration': // like: "function foo() {}"
    case 'VariableDeclaration': // like: "var foo = function(){}"
    case 'ExpressionStatement': // like: "module.exports = function foo() {}"
    case 'MethodDefinition':    // like: "foo(){}"
      doclet = handleFunctionType(node);
      break;
    case 'ClassDeclaration':    // like: "class Foo {}"
      doclet = handleClassType(node);
      break;
    default:
      break;
  }
  if (doclet) doclets.push(doclet);
}

function extractDataRegex(doc: string, doclets: Array<Doclet>) {
  const commentsAst = doctrine.parse(doc, { unwrap: true });
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
        args.push(formatTag(tag));
        break;
      case 'returns':
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
    // const ast = esprima.parse(data, {
    //   attachComment: true,
    //   sourceType: 'module'
    // });
    // walk(ast, node => extractData(node, doclets));
  } catch (e) {
    // never mind, ignore the doc of this source
  }
  return doclets;
}
