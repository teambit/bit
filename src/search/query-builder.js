/** @flow */
import { tokenizeStr, stem } from './indexer';
import stopwords from './stopwords';

const boost = {
  box: 3,
  tokenizedBox: 2,
  name: 5,
  tokenizedName: 4,
  stemmedName: 3,
  functionNames: 2,
  tokenizedFunctionNames: 2,
  minDescription: 1,
  stemmedMinDescription: 0.5
};

function queryItem(field, queryStr): Object {
  return {
    AND: { [field]: queryStr.toLowerCase().split(' ') },
    BOOST: boost[field]
  };
}

function buildQuery(queryStr: string): Array<Object> {
  const queryStrWithoutStopwords = queryStr
    .split(' ')
    .filter(word => !stopwords.includes(word))
    .join(' ');
  const tokenizedQuery = tokenizeStr(queryStr);
  const query = [];
  query.push(queryItem('box', queryStr));
  query.push(queryItem('tokenizedBox', queryStr));
  query.push(queryItem('name', queryStr));
  query.push(queryItem('tokenizedName', tokenizedQuery));
  query.push(queryItem('stemmedName', stem(tokenizedQuery)));
  query.push(queryItem('functionNames', queryStr));
  query.push(queryItem('tokenizedFunctionNames', tokenizedQuery));
  query.push(queryItem('minDescription', queryStrWithoutStopwords));
  query.push(queryItem('stemmedMinDescription', stem(queryStrWithoutStopwords)));
  return query;
}

export default buildQuery;
