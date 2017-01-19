/** @Flow */
import esprima from 'esprima';
import doctrine from 'doctrine';
import walk from 'esprima-walk';

type DataInfo = {
    type: string,
    name: string,
    description: string,
    params?: Array,
    returns?: Object,
};

const parsedData: Array<DataInfo> = [];

function getFunctionName(node: Object): string {
  if (node.type === 'FunctionDeclaration') return node.id.name;
  if (node.type === 'ExpressionStatement') return node.expression.right.id.name;
  if (node.type === 'MethodDefinition') return node.key.name;
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

function handleFunctionType(node: Object) {
  if (node.type === 'ExpressionStatement' 
  && (!node.expression.right || node.expression.right.type !== 'FunctionExpression')) return;

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
    case 'FunctionDeclaration':
    case 'ExpressionStatement':
    case 'MethodDefinition':
      handleFunctionType(node);
      break;
    case 'ClassDeclaration':
      handleClassType(node);
      break;
    default:
      break;  
  }
}

function toString(doc: DataInfo): string {
  let params;
  let returns = '';
  let formattedDoc = `type: ${doc.type}, name: ${doc.name}`;
  if (doc.description) {
    formattedDoc += `, description: ${doc.description}`;
  }
  if (doc.params && doc.params.length) {
    params = doc.params.map((param) => {
      let formattedParam = `${param.name}`;
      if (param.type) {
        formattedParam += ` (${param.type})`;
      }
      return formattedParam;
    }).join(', ');
    formattedDoc += `, params: ${params}`;
  }
  if (doc.returns) {
    if (doc.returns.description) {
      returns = `${doc.returns.description} `;
    }
    if (doc.returns.type) {
      returns += `(${doc.returns.type})`;
    }
    if (returns) {
      formattedDoc += `, returns: ${returns}`;
    }
  }
  
  return formattedDoc;
}

function parse(data: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      const ast = esprima.parse(data, { 
        attachComment: true, 
        sourceType: 'module' 
      });
      walk(ast, extractData);
      resolve(parsedData);
    } catch (e) { // never mind, ignore the doc of this source
      resolve();
    }
  });
}

module.exports = {
  parse,
  toString
};
