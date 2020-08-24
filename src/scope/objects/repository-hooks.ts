import isRelative from 'is-relative-path';
import path from 'path';

import { ScopeJson } from '../scope-json';

export type ContentTransformer = (content: Buffer) => Buffer;

function loadHooks(scopePath: string, scopeJson: ScopeJson): any | undefined {
  const hooksPath = scopeJson.hooksPath;
  if (hooksPath) {
    const hooksFinalPath = isRelative(hooksPath) ? path.join(scopePath, hooksPath) : hooksPath;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const hooks = require(hooksFinalPath);
    return hooks;
  }
  return undefined;
}

export function onPersist(scopePath: string, scopeJson: ScopeJson): ContentTransformer {
  const defaultFunc = (content) => content;
  const hooks = loadHooks(scopePath, scopeJson);
  if (hooks) {
    const onReadFunction = hooks.onPersist;
    if (onReadFunction) {
      return onReadFunction;
    }
  }
  return defaultFunc;
}

export function onRead(scopePath: string, scopeJson: ScopeJson): ContentTransformer {
  const defaultFunc = (content) => content;

  const hooks = loadHooks(scopePath, scopeJson);
  if (hooks) {
    const onReadFunction = hooks.onRead;
    if (onReadFunction) {
      return onReadFunction;
    }
  }
  return defaultFunc;
}
