/** @Flow */
import esprima from 'esprima';
import doctrine from 'doctrine';
import walk from 'esprima-walk';
import exampleTagParser from './example-tag-parser';

export type ParsedDocs = {
  name: string,
  description: string,
  args?: Array,
  returns?: Object,
  access?: string,
  examples?: Array,
  static?: Boolean
};

const parsedData: Array<ParsedDocs> = [];

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

function handleFunctionType(node: Object) {
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
        case 'returns'  :
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
  const item = {
    name,
    description,
    args,
    returns,
    access,
    examples,
    static: isStatic,
  };
  parsedData.push(item);
}

function handleClassType(node: Object) {
  let description = '';
  if (node.leadingComments && node.leadingComments.length) {
    const commentsAst = getCommentsAST(node);
    description = commentsAst.description;
  }
  const item = {
    name: node.id.name,
    description
  };
  parsedData.push(item);
}

function extractData(node: Object) {
  if (!node || !node.type) return;
  switch (node.type) {
    case 'FunctionDeclaration': // like: "function foo() {}"
    case 'VariableDeclaration': // like: "var foo = function(){}"
    case 'ExpressionStatement': // like: "module.exports = function foo() {}"
    case 'MethodDefinition':    // like: "foo(){}"
      handleFunctionType(node);
      break;
    case 'ClassDeclaration':    // like: "class Foo {}"
      handleClassType(node);
      break;
    default:
      break;
  }
}

function toString(doc: ParsedDocs): string {
  let args;
  let returns = '';
  let formattedDoc = `\nname: ${doc.name} \n`;

  if (doc.description) {
    formattedDoc += `description: ${doc.description}\n`;
  }

  if (doc.args && doc.args.length) {
    args = doc.args.map((arg) => {
      let formattedParam = `${arg.name}`;
      if (arg.type) {
        formattedParam += ` (${arg.type})`;
      }
      return formattedParam;
    }).join(', ');
    formattedDoc += `args: ${args}\n`;
  }
  if (doc.returns) {
    if (doc.returns.description) {
      returns = `${doc.returns.description} `;
    }

    if (doc.returns.type) {
      returns += `(${doc.returns.type})`;
    }

    if (returns) {
      formattedDoc += `returns: ${returns}\n`;
    }
  }

  return formattedDoc;
}

function parse(data: string): ParsedDocs|[] {
  try {
    const ast = esprima.parse(data, {
      attachComment: true,
      sourceType: 'module'
    });
    walk(ast, extractData);
    return parsedData;
  } catch (e) { // never mind, ignore the doc of this source
    return parsedData;
  }
}

module.exports = {
  parse,
  toString
};
