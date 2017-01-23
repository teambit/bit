/* @flow */
import Scope from '../../scope/scope';

const hubResolver = (scopeName) => {
  const hubPrefix = 'ssh://bit@hub.bitsrc.io:';
  return Promise.resolve(hubPrefix + scopeName);
};

const remoteResolver = (scopeName: string, thisScope: Scope): Promise<string> => {
  const resolverPath = thisScope.scopeJson.resolverPath;
  let resolverFunction;
  if (!resolverPath) resolverFunction = hubResolver;
  // $FlowFixMe
  else resolverFunction = require(resolverPath);

  return resolverFunction(scopeName, thisScope.name);
};

export default remoteResolver;
