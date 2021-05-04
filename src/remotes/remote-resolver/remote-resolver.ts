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
import { getAuthHeader, getFetcherWithAgent } from '../../scope/network/http/http';
import logger from '../../logger/logger';

const hubDomain = getSync(CFG_HUB_DOMAIN_KEY) || DEFAULT_HUB_DOMAIN;
const symphonyUrl = getSync(CFG_SYMPHONY_URL_KEY) || SYMPHONY_URL;

type ResolverFunction = (scopeName: string, thisScopeName?: string, token?: string) => Promise<string>;

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
  const headers = token ? getAuthHeader(token) : {};
  const graphQlUrl = `https://${symphonyUrl}/graphql`;
  const graphQlFetcher = await getFetcherWithAgent(graphQlUrl);
  const client = new GraphQLClient(graphQlUrl, { headers, fetch: graphQlFetcher });

  try {
    const res = await client.request(SCOPE_GET, {
      id: name,
    });
    scopeCache[name] = res;
    return res;
  } catch (err) {
    logger.error('getScope has failed', err);
    throw new Error(
      `${name}: ${
        err?.response?.errors?.[0].message || "unknown error. please use the '--log' flag for the full error."
      }`
    );
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
  const resolverPath = thisScope?.scopeJson.resolverPath;
  let resolverFunction: ResolverFunction;
  if (!resolverPath) {
    // use the default resolver
    resolverFunction = hubResolver;
  } else {
    // use the resolver described in the scopeJson
    // eslint-disable-next-line import/no-dynamic-require, global-require
    resolverFunction = require(resolverPath);
  }

  return resolverFunction(scopeName, thisScope ? thisScope.name : undefined, token); // should return promise<string>
};

export default remoteResolver;
