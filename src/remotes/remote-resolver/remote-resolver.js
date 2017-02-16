/* @flow */
import R from 'ramda';
import Scope from '../../scope/scope';
import { getSync } from '../../api/consumer/lib/global-config';

const DEFAULT_HUB_DOMAIN = 'hub.bitsrc.io';
const hubDomain = getSync('hub_domain') || DEFAULT_HUB_DOMAIN;

const hubResolver = (scopeName) => {
  const hubPrefix = `ssh://bit@${hubDomain}:`;
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
