// @flow
import glob from 'glob';
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
import {
  VERSION_DELIMITER,
  ID_DELIMITER,
  DEFAULT_BUNDLE_FILENAME,
  DEFAULT_DIST_DIRNAME,
  NO_PLUGIN_TYPE,
} from '../constants';
import InlineScope from '../scope/inline-scope';

const generateId = ({ scope, namespace, name, version }) =>
  scope + ID_DELIMITER + namespace + ID_DELIMITER + name + VERSION_DELIMITER + version;

function getRequiredFile(bitJson: BitJson): string {
  return !bitJson.compiler || bitJson.compiler !== NO_PLUGIN_TYPE ?
    path.join(DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME) : bitJson.impl;
}

function getInlineScopeNameP(projectRoot: string): Promise<string> {
  return new Promise((resolve) => {
    const inlineScope = InlineScope.load(projectRoot);
    inlineScope
      .then(inlineScopeName => resolve(inlineScopeName.getScopeName()))
      .catch(() => resolve(''));
  });
}

export function buildForInline(targetComponentsDir: string, bitJson: BitJson): Promise<Object> {
  return new Promise((resolve, reject) => {
    const componentsMap = {};
    glob('*/*', { cwd: targetComponentsDir }, (err, files) => {
      if (err) return reject(err);
      files.forEach((loc) => {
        const file = getRequiredFile(bitJson);
        componentsMap[loc] = { loc, file };
      });

      return resolve(componentsMap);
    });
  });
}

export function build(projectRoot: string, targetComponentsDir: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    const componentsMap = {};
    getInlineScopeNameP(projectRoot).then((inlineScopeName) => {
      glob('*/*/*/*', { cwd: targetComponentsDir }, (err, files) => {
        if (err) return reject(err);
        files.forEach((loc) => {
          const [namespace, name, scope, version] = loc.split(path.sep);
          const id = generateId({ scope, namespace, name, version });
          const bitJson = BitJson.load(path.join(targetComponentsDir, loc));
          const dependencies = [];
          Object.keys(bitJson.dependencies).forEach((dependency) => {
            dependencies.push(dependency + VERSION_DELIMITER + bitJson.dependencies[dependency]);
          });
          const file = getRequiredFile(bitJson);
          const isFromInlineScope = inlineScopeName === scope;

          componentsMap[id] = { loc, file, dependencies, isFromInlineScope };
        });
        return resolve(componentsMap);
      });
    });
  });
}
