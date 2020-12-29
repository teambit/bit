/* @flow */
import R from 'ramda';
import { GraphQLClient, gql } from 'graphql-request';
import { getSync } from '../../api/consumer/lib/global-config';
import {
  CFG_HUB_DOMAIN_KEY,
  DEFAULT_HUB_DOMAIN,
  CFG_USER_TOKEN_KEY,
  SYMPHONY_URL,
  CFG_SYMPHONY_URL_KEY,
} from '../../constants';
import Scope from '../../scope/scope';
import logger from '../../logger/logger';
import { DEFAULT_AUTH_TYPE } from '../../scope/network/http/http';

const hubDomain = getSync(CFG_HUB_DOMAIN_KEY) || DEFAULT_HUB_DOMAIN;
const symphonyUrl = getSync(CFG_SYMPHONY_URL_KEY) || SYMPHONY_URL;

const scopeCache = {};

const SCOPE_GET = gql`
  query GET_SCOPE($id: String!) {
    getScope(id: $id) {
      isLegacy
      apis {
        url
      }
    }
  }
`;

// comment this out once on production
async function getScope(name: string) {
  if (scopeCache[name]) return scopeCache[name];
  const token = getSync(CFG_USER_TOKEN_KEY);
  const client = new GraphQLClient(`https://${symphonyUrl}/graphql`);
  if (token) client.setHeader('Authorization', `${DEFAULT_AUTH_TYPE} ${token}`);

  try {
    const res = await client.request(SCOPE_GET, {
      id: name,
    });

    scopeCache[name] = res;
    return res;
  } catch (err) {
    logger.error(err);
    return undefined;
  }
}

const hubResolver = async (scopeName) => {
  // check if has harmony
  const scope = await getScope(scopeName);
  const harmonyScope = scope && scope.getScope && scope.getScope.isLegacy === false;

  if (harmonyScope) {
    return scope.getScope.apis.url;
  }
  const hubPrefix = `ssh://bit@${hubDomain}:`;
  return hubPrefix + scopeName;
};

const remoteResolver = (scopeName: string, thisScope?: Scope): Promise<string> => {
  const token = getSync(CFG_USER_TOKEN_KEY);
  const resolverPath = R.path(['scopeJson', 'resolverPath'], thisScope);
  let resolverFunction;
  if (!resolverPath) {
    resolverFunction = hubResolver;
  } else {
    // use the default resolver
    // eslint-disable-next-line import/no-dynamic-require, global-require
    resolverFunction = require(resolverPath);
  } // use the resolver described in the scopeJson

  return resolverFunction(scopeName, thisScope ? thisScope.name : undefined, token); // should return promise<string>
};

export default remoteResolver;
