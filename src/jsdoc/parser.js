/** @Flow */
import esprima from 'esprima';
import doctrine from 'doctrine';
import walk from 'esprima-walk';

export type ParsedDocs = {
    type: string,
    name: string,
    description: string,
    params?: Array,
    returns?: Object,
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

  const params = [];
  let description = '';
  let returns = {};
  if (node.leadingComments && node.leadingComments.length) {
    const commentsAst = getCommentsAST(node);
    description = commentsAst.description;

    for (const tag of commentsAst.tags) {
      if (tag.title === 'param') {
        params.push(formatTag(tag));
      }
      if (tag.title === 'returns') {
        returns = formatTag(tag);
      }
    }
  }

  const name = getFunctionName(node);
  const item = {
    type: node.type,
    name,
    description,
    params,
    returns,
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
    type: node.type,
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
  let params;
  let returns = '';
  let formattedDoc = `\ntype: ${doc.type}\nname: ${doc.name} \n`;

  if (doc.description) {
    formattedDoc += `description: ${doc.description}\n`;
  }

  if (doc.params && doc.params.length) {
    params = doc.params.map((param) => {
      let formattedParam = `${param.name}`;
      if (param.type) {
        formattedParam += ` (${param.type})`;
      }
      return formattedParam;
    }).join(', ');
    formattedDoc += `params: ${params}\n`;
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
