/* @flow */
import R from 'ramda';
import Scope from '../../scope/scope';

const hubResolver = (scopeName) => {
  const hubPrefix = 'ssh://bit@hub.bitsrc.io:';
  return Promise.resolve(hubPrefix + scopeName);
};

const remoteResolver = (scopeName: string, thisScope: Scope): Promise<string> => {
  const resolverPath = R.path(['scopeJson', 'resolverPath'], thisScope);
  let resolverFunction;
  if (!resolverPath) resolverFunction = hubResolver;
  // $FlowFixMe
  else resolverFunction = require(resolverPath);

  return resolverFunction(scopeName, thisScope.name);
};

export default remoteResolver;
