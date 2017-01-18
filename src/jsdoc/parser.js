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

function formatTag(tag) {
  delete tag.title;
  if (!tag.type) return tag;
  if (tag.type.name) tag.type = tag.type.name;
  else if (tag.type.type) tag.type = tag.type.type;
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
          params.push(formatTag(tag));
        }
        if (tag.title === 'returns') {
          returns = formatTag(tag);
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
    parsedData.push(postProcess(item));
  }
}

function postProcess(doc: FunctionInfo): string {
  let params;
  let returns = '';
  let formattedDoc = `name: ${doc.name}`;
  if (doc.description) {
    formattedDoc += `, description: ${doc.description}`;
  }
  if (doc.params.length) {
    params = doc.params.map((param) => {
      let formattedParam = `${param.name}`;
      if (param.type) {
        formattedParam += ` (${param.type})`;
      }
      return formattedParam;
    }).join(', ');
    formattedDoc += `, params: ${params}`;
  }
  if (doc.returns.description) {
    returns = `${doc.returns.description} `;
  }
  if (doc.returns.type) {
    returns += `(${doc.returns.type})`;
  }
  if (returns) {
    formattedDoc += `, returns: ${returns}`;
  }
  
  return formattedDoc;
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
