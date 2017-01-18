/** @Flow */
import esprima from 'esprima';
import doctrine from 'doctrine';
import walk from 'esprima-walk';

type FunctionInfo = {
    name: string,
    description: string,
    params: Array,
    returns: Object,
};

const parsedData: Array<FunctionInfo> = [];

function getFunctionName(node: Object): string {
  if (node.type === 'FunctionDeclaration') return node.id.name;
  if (node.type === 'ExpressionStatement') return node.expression.right.id.name;
  throw new Error('The node is not recognized');
}

function isFunctionType(node: Object): boolean {
  if (node.type === 'FunctionDeclaration') return true;
  if (node.type === 'ExpressionStatement' && node.expression.right.type === 'FunctionExpression') return true;
  return false;
}

function formatParam(param) {
  delete param.title;
  if (param.type.type && param.type.name && param.type.type === 'NameExpression') {
    param.type = param.type.name;
  }
  return param;
}

function formatReturns(tag) {
  delete tag.title;
  if (!tag.type) return tag;
  if (tag.type.type) tag.type = tag.type.type;
  return tag;
}

function extractData(node) {
  if (node && node.type && isFunctionType(node)) {
    const params = [];
    let description = '';
    let returns = {};

    if (node.leadingComments && node.leadingComments.length) {
      const comment = node.leadingComments[node.leadingComments.length-1].value;
      const commentsAst = doctrine.parse(comment, { unwrap: true });
      description = commentsAst.description;

      for (const tag of commentsAst.tags) {
        if (tag.title === 'param') {
          params.push(formatParam(tag));
        }
        if (tag.title === 'returns') {
          returns = formatReturns(tag);
        }
      }
    }

    const name = getFunctionName(node);
    const item = {
      name,
      description,
      params,
      returns,
    };
    parsedData.push(item);
  }
}

function parse(data) {
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
  parse
};
