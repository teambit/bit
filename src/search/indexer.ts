import { Readable } from 'stream';
import { stemmer } from 'porter-stemmer';
import Component from '../consumer/component/consumer-component';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import serverlessIndex from './serverless-index';
import logger from '../logger/logger';

export type Doc = {
  id: string;
  name: string;
  tokenizedName: string;
  stemmedName: string;
  functionNames: string;
  tokenizedFunctionNames: string;
  description: string;
  minDescription: string;
  stemmedMinDescription: string;
};

const stem = (sentence: string): string => sentence.split(' ').map(stemmer).join(' ');
let indexInstance;

function tokenizeStr(str: string): string {
  return str
    .trim()
    .split(/(?=[A-Z])/)
    .join(' ')
    .toLowerCase()
    .split(/ |_|-/)
    .join(' ');
}

/**
 * returns the first sentence of the description.
 * @param {string} desc
 * @return {string}
 */
function minimizeDescription(desc: string = ''): string {
  return desc.split(/\.|;/)[0]; // split by a dot or a semicolon
}

function prepareDoc(docs: Object, component: Component): Doc {
  const name = component.name;
  const tokenizedName = tokenizeStr(name);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const functionNames = docs.map((doc) => doc.name).join(' ');
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const minDescription = docs.map((doc) => minimizeDescription(doc.description)).join(' ');
  return {
    id: name,
    name,
    tokenizedName,
    stemmedName: stem(tokenizedName),
    functionNames,
    tokenizedFunctionNames: tokenizeStr(functionNames),
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    description: docs.map((doc) => doc.description).join(' '),
    minDescription,
    stemmedMinDescription: stem(minDescription),
  };
}

function addAllToLocalIndex(components: Array<Component>): Promise<string> {
  return new Promise((resolve) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const docs = components.map((component) => prepareDoc(component.docs, component));
    const docStream = new Readable({ objectMode: true });
    // $FlowFixMe: a flow bug. Stream can be an object as well when objectMode is true
    docs.map((doc) => docStream.push(doc));
    docStream.push(null);
    docStream
      .pipe(indexInstance.defaultPipeline())
      .pipe(indexInstance.add())
      .on('finish', () => {
        resolve('The indexing has been completed');
      });
  });
}

function addToLocalIndex(component: Component): Promise<Component> {
  return new Promise((resolve) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const doc = prepareDoc(component.docs, component);
    const docStream = new Readable({ objectMode: true });
    // $FlowFixMe: a flow bug. Stream can be an object as well when objectMode is true
    docStream.push(doc);
    docStream.push(null);
    docStream
      .pipe(indexInstance.defaultPipeline())
      .pipe(indexInstance.add())
      .on('finish', () => {
        resolve(component);
      });
  });
}

async function index(component: Component, scopePath: string): Promise<Component> {
  // if (isWin) return Promise.resolve(component);
  try {
    indexInstance = await serverlessIndex.initializeIndex(scopePath);
    return addToLocalIndex(component);
  } catch (err) {
    logger.error(`search.indexer found an issue while indexing. Error: ${err}`);
    console.warn(err); // eslint-disable-line // TODO - handle this error
    return Promise.resolve(component);
  }
}

async function indexAll(path: string, components: Component[]): Promise<any> {
  if (!components) return Promise.reject('The scope is empty');
  logger.debug(`indexing all, scope path ${path}`);
  indexInstance = await serverlessIndex.initializeIndex(path);
  serverlessIndex.deleteDb(path);
  const results = addAllToLocalIndex(components);
  return Promise.resolve(results);
}

module.exports = {
  index,
  indexAll,
  tokenizeStr,
  stem,
};
