/* @flow */
import R from 'ramda';
import Scope from '../../scope/scope';
import { getSync } from '../../api/consumer/lib/global-config';
import { DEFAULT_HUB_DOMAIN, CFG_HUB_DOMAIN_KEY } from '../../constants';

const hubDomain = getSync(CFG_HUB_DOMAIN_KEY) || DEFAULT_HUB_DOMAIN;

const hubResolver = (scopeName) => {
  const hubPrefix = `ssh://bit@${hubDomain}:`;
  return Promise.resolve(hubPrefix + scopeName);
};

const remoteResolver = (scopeName: string, thisScope?: Scope): Promise<string> => {
  const resolverPath = R.path(['scopeJson', 'resolverPath'], thisScope);
  let resolverFunction;
  if (!resolverPath) {
    resolverFunction = hubResolver;
  } else {
    // use the default resolver
    // eslint-disable-next-line import/no-dynamic-require, global-require
    resolverFunction = require(resolverPath);
  } // use the resolver described in the scopeJson

  return resolverFunction(scopeName, thisScope ? thisScope.name : undefined); // should return promise<string>
};

export default remoteResolver;
