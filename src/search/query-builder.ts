// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import { tokenizeStr, stem } from './indexer';
import stopwords from './stopwords';

const boost = {
  name: 5,
  tokenizedName: 4,
  stemmedName: 3,
  functionNames: 2,
  tokenizedFunctionNames: 2,
  minDescription: 1,
  stemmedMinDescription: 0.5,
};

function queryItem(field, queryStr): Object {
  return {
    AND: { [field]: queryStr.toLowerCase().split(' ') },
    BOOST: boost[field],
  };
}

function buildQuery(queryStr: string): Array<Object> {
  const queryStrWithoutStopwords = queryStr
    .split(' ')
    .filter((word) => !stopwords.includes(word))
    .join(' ');
  const tokenizedQuery = tokenizeStr(queryStr);
  const query = [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('name', queryStr));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('tokenizedName', tokenizedQuery));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('stemmedName', stem(tokenizedQuery)));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('functionNames', queryStr));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('tokenizedFunctionNames', tokenizedQuery));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('minDescription', queryStrWithoutStopwords));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  query.push(queryItem('stemmedMinDescription', stem(queryStrWithoutStopwords)));
  return query;
}

export default buildQuery;
