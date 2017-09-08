/** @flow */
import { Readable } from 'stream';
import { stemmer } from 'porter-stemmer';
import Component from '../consumer/component';
import serverlessIndex from './serverless-index';
import logger from '../logger/logger';

const isWin = require('os').platform() === 'win32';

export type Doc = {
  id: string,
  name: string,
  tokenizedName: string,
  stemmedName: string,
  box: string,
  tokenizedBox: string,
  functionNames: string,
  tokenizedFunctionNames: string,
  description: string,
  minDescription: string,
  stemmedMinDescription: string
};

const stem = (sentence: string): string =>
  sentence
    .split(' ')
    .map(stemmer)
    .join(' ');
let localIndex;

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
  const box = component.box;
  const tokenizedName = tokenizeStr(name);
  const functionNames = docs.map(doc => doc.name).join(' ');
  const minDescription = docs.map(doc => minimizeDescription(doc.description)).join(' ');
  return {
    id: `${box}_${name}`,
    name,
    box,
    tokenizedName,
    stemmedName: stem(tokenizedName),
    tokenizedBox: tokenizeStr(box),
    functionNames,
    tokenizedFunctionNames: tokenizeStr(functionNames),
    description: docs.map(doc => doc.description).join(' '),
    minDescription,
    stemmedMinDescription: stem(minDescription)
  };
}

function addAllToLocalIndex(components: Array<Component>): Promise<string> {
  return new Promise((resolve, reject) => {
    const docs = components.map(component => prepareDoc(component.docs, component));
    localIndex.then((indexInstance) => {
      const docStream = new Readable({ objectMode: true });
      // $FlowFixMe: a flow bug. Stream can be an object as well when objectMode is true
      docs.map(doc => docStream.push(doc));
      docStream.push(null);
      docStream
        .pipe(indexInstance.defaultPipeline())
        .pipe(indexInstance.add())
        .on('finish', () => {
          resolve('The indexing has been completed');
        });
    });
  });
}

function addToLocalIndex(component: Component): Promise<Component> {
  return new Promise((resolve, reject) => {
    const doc = prepareDoc(component.docs, component);
    localIndex.then((indexInstance) => {
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
  });
}

function index(component: Component, scopePath: string): Promise<Component> {
  // if (isWin) return Promise.resolve(component);
  try {
    localIndex = serverlessIndex.initializeIndex(scopePath);
    return addToLocalIndex(component);
  } catch (err) {
    logger.error(`search.indexer found an issue while indexing. Error: ${err}`);
    console.warn(err); // eslint-disable-line // TODO - handle this error
    return Promise.resolve(component);
  }
}

function indexAll(path: string, components: Component[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!components) return reject('The scope is empty');
    logger.debug(`indexing all, scope path ${path}`);
    serverlessIndex.deleteDb(path);
    localIndex = serverlessIndex.initializeIndex(path);
    const results = addAllToLocalIndex(components);
    return resolve(results);
  });
}

module.exports = {
  index,
  indexAll,
  tokenizeStr,
  stem
};
