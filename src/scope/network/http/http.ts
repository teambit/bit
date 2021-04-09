import { ClientError, gql, GraphQLClient } from 'graphql-request';
import fetch, { Response } from 'node-fetch';
import readLine from 'readline';
import HttpAgent from 'agentkeepalive';

import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { getAgent, AgentOptions } from '@teambit/network.agent';
import { Network } from '../network';
import { getHarmonyVersion } from '../../../bootstrap';
import { BitId, BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { ListScopeResult } from '../../../consumer/component/components-list';
import DependencyGraph from '../../graph/scope-graph';
import { LaneData } from '../../lanes/lanes';
import { ComponentLog } from '../../models/model-component';
import { ScopeDescriptor } from '../../scope';
import globalFlags from '../../../cli/global-flags';
import { getSync, list } from '../../../api/consumer/lib/global-config';
import {
  CFG_HTTPS_PROXY,
  CFG_PROXY,
  CFG_USER_TOKEN_KEY,
  CFG_PROXY_CA,
  CFG_PROXY_CERT,
  CFG_PROXY_KEY,
  CFG_PROXY_NO_PROXY,
  CFG_PROXY_STRICT_SSL,
} from '../../../constants';
import logger from '../../../logger/logger';
import { ObjectItemsStream, ObjectList } from '../../objects/object-list';
import { FETCH_OPTIONS } from '../../../api/scope/lib/fetch';
import { remoteErrorHandler } from '../remote-error-handler';
import { PushOptions } from '../../../api/scope/lib/put';
import { HttpInvalidJsonResponse } from '../exceptions/http-invalid-json-response';
import RemovedObjects from '../../removed-components';
import { GraphQLClientError } from '../exceptions/graphql-client-error';
import loader from '../../../cli/loader';
import { UnexpectedNetworkError } from '../exceptions';

export enum Verb {
  WRITE = 'write',
  READ = 'read',
}

export type ProxyConfig = {
  ca?: string;
  cert?: string;
  httpProxy?: string;
  httpsProxy?: string;
  key?: string;
  noProxy?: boolean | string;
  strictSSL?: boolean;
};

type Agent = HttpsProxyAgent | HttpAgent | HttpAgent.HttpsAgent | HttpProxyAgent | SocksProxyAgent | undefined;

/**
 * fetched from HTTP Authorization header.
 * (see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization)
 */
export type AuthData = { type: string; credentials: string };
export const DEFAULT_AUTH_TYPE = 'Bearer';

export class Http implements Network {
  constructor(
    private graphClient: GraphQLClient,
    private _token: string | undefined | null,
    private url: string,
    private scopeName: string,
    private proxyConfig?: ProxyConfig,
    private agent?: Agent,
    private localScopeName?: string
  ) {}

  static getToken() {
    const processToken = globalFlags.token;
    const token = processToken || getSync(CFG_USER_TOKEN_KEY);
    if (!token) return null;

    return token;
  }

  static async getProxyConfig(checkProxyUriDefined = true): Promise<ProxyConfig> {
    const obj = await list();
    const httpProxy = obj[CFG_PROXY];
    const httpsProxy = obj[CFG_HTTPS_PROXY] ?? obj[CFG_PROXY];

    // If check is true, return the proxy config only case there is actual proxy server defined
    if (checkProxyUriDefined && !httpProxy && !httpsProxy) {
      return {};
    }

    return {
      ca: obj[CFG_PROXY_CA],
      cert: obj[CFG_PROXY_CERT],
      httpProxy,
      httpsProxy,
      key: obj[CFG_PROXY_KEY],
      noProxy: obj[CFG_PROXY_NO_PROXY],
      strictSSL: obj[CFG_PROXY_STRICT_SSL],
    };
  }

  static async getAgent(uri: string, agentOpts: AgentOptions): Promise<Agent> {
    const agent = await getAgent(uri, agentOpts);
    return agent;
  }

  get token() {
    if (this._token === undefined) return this._token;
    return Http.getToken();
  }

  close(): void {}

  async describeScope(): Promise<ScopeDescriptor> {
    const SCOPE_QUERY = gql`
      {
        scope {
          name
        }
      }
    `;

    const data = await this.graphClientRequest(SCOPE_QUERY, Verb.READ);

    return {
      name: data.scope.name,
    };
  }

  async deleteMany(ids: string[], force: boolean, context: Record<string, any>, idsAreLanes: boolean) {
    const route = 'api/scope/delete';
    logger.debug(`Http.delete, url: ${this.url}/${route}`);
    const body = JSON.stringify({
      ids,
      force,
      lanes: idsAreLanes,
    });
    const headers = this.getHeaders({ 'Content-Type': 'application/json', 'x-verb': 'write' });
    const opts = this.addAgentIfExist({
      method: 'post',
      body,
      headers,
    });
    const res = await fetch(`${this.url}/${route}`, opts);
    await this.throwForNonOkStatus(res);
    const results = await this.getJsonResponse(res);
    return RemovedObjects.fromObjects(results);
  }

  async pushMany(objectList: ObjectList, pushOptions: PushOptions): Promise<string[]> {
    const route = 'api/scope/put';
    logger.debug(`Http.pushMany, url: ${this.url}/${route}  total objects ${objectList.count()}`);

    const body = objectList.toTar();
    const headers = this.getHeaders({ 'push-options': JSON.stringify(pushOptions), 'x-verb': Verb.WRITE });
    const opts = this.addAgentIfExist({
      method: 'post',
      body,
      headers,
    });
    const res = await fetch(`${this.url}/${route}`, opts);
    await this.throwForNonOkStatus(res);
    const ids = await this.getJsonResponse(res);
    return ids;
  }

  async pushToCentralHub(
    objectList: ObjectList,
    options: Record<string, any> = {}
  ): Promise<{
    successIds: string[];
    failedScopes: string[];
    exportId: string;
    errors: { [scopeName: string]: string };
  }> {
    const route = 'api/put';
    logger.debug(`Http.pushToCentralHub, started. url: ${this.url}/${route}. total objects ${objectList.count()}`);
    const pack = objectList.toTar();
    const opts = this.addAgentIfExist({
      method: 'post',
      body: pack,
      headers: this.getHeaders({ 'push-options': JSON.stringify(options), 'x-verb': Verb.WRITE }),
    });
    const res = await fetch(`${this.url}/${route}`, opts);
    logger.debug(
      `Http.pushToCentralHub, completed. url: ${this.url}/${route}, status ${res.status} statusText ${res.statusText}`
    );

    const results = await this.readPutCentralStream(res.body);
    if (!results.data) throw new Error(`HTTP results are missing "data" property`);
    if (results.data.isError) {
      throw new UnexpectedNetworkError(results.message);
    }
    await this.throwForNonOkStatus(res);
    return results.data;
  }

  async action<Options, Result>(name: string, options: Options): Promise<Result> {
    const route = 'api/scope/action';
    logger.debug(`Http.action, url: ${this.url}/${route}`);
    const body = JSON.stringify({
      name,
      options,
    });
    const headers = this.getHeaders({ 'Content-Type': 'application/json', 'x-verb': Verb.WRITE });
    const opts = this.addAgentIfExist({
      method: 'post',
      body,
      headers,
    });
    const res = await fetch(`${this.url}/${route}`, opts);
    await this.throwForNonOkStatus(res);
    const results = await this.getJsonResponse(res);
    return results;
  }

  async fetch(ids: string[], fetchOptions: FETCH_OPTIONS): Promise<ObjectItemsStream> {
    const route = 'api/scope/fetch';
    const scopeData = `scopeName: ${this.scopeName}, url: ${this.url}/${route}`;
    logger.debug(`Http.fetch, ${scopeData}`);
    const body = JSON.stringify({
      ids,
      fetchOptions,
    });
    const headers = this.getHeaders({ 'Content-Type': 'application/json', 'x-verb': Verb.READ });
    const opts = this.addAgentIfExist({
      method: 'post',
      body,
      headers,
    });
    const res = await fetch(`${this.url}/${route}`, opts);
    logger.debug(`Http.fetch got a response, ${scopeData}, status ${res.status}, statusText ${res.statusText}`);
    await this.throwForNonOkStatus(res);
    const objectListReadable = ObjectList.fromTarToObjectStream(res.body);

    return objectListReadable;
  }

  private async getJsonResponse(res: Response) {
    try {
      return await res.json();
    } catch (err) {
      logger.error('failed response', res);
      throw new HttpInvalidJsonResponse(res.url);
    }
  }

  private async throwForNonOkStatus(res: Response) {
    if (res.ok) return;
    let jsonResponse;
    try {
      jsonResponse = await res.json();
    } catch (e) {
      // the response is not json, ignore the body.
    }
    logger.error(`parsed error from HTTP, url: ${res.url}`, jsonResponse);
    const error = jsonResponse?.error?.code ? jsonResponse?.error : jsonResponse;
    if (error && !error.message && jsonResponse.message) error.message = jsonResponse.message;
    const err = remoteErrorHandler(
      error?.code,
      error,
      res.url,
      `url: ${res.url}. status: ${res.status}. text: ${res.statusText}`
    );
    throw err;
  }

  private async graphClientRequest(query: string, verb: string = Verb.READ, variables?: Record<string, any>) {
    logger.debug(`http.graphClientRequest, scope "${this.scopeName}", url "${this.url}", query ${query}`);
    try {
      this.graphClient.setHeader('x-verb', verb);
      return await this.graphClient.request(query, variables);
    } catch (err) {
      if (err instanceof ClientError) {
        throw new GraphQLClientError(err, this.url, this.scopeName);
      }
      // should not be here. it's just in case
      throw err;
    }
  }

  private async readPutCentralStream(body: NodeJS.ReadableStream): Promise<any> {
    const readline = readLine.createInterface({
      input: body,
      crlfDelay: Infinity,
    });

    let results: Record<string, any> = {};
    readline.on('line', (line) => {
      const json = JSON.parse(line);
      if (json.end) results = json;
      loader.start(json.message);
    });

    return new Promise((resolve, reject) => {
      readline.on('close', () => {
        resolve(results);
      });
      readline.on('error', (err) => {
        logger.error('readLine failed with error', err);
        reject(new Error(`readline failed with error, ${err?.message}`));
      });
    });
  }

  async list(namespacesUsingWildcards?: string | undefined): Promise<ListScopeResult[]> {
    const LIST_LEGACY = gql`
      query listLegacy($namespaces: String) {
        scope {
          _legacyList(namespaces: $namespaces) {
            id
            deprecated
          }
        }
      }
    `;

    const data = await this.graphClientRequest(LIST_LEGACY, Verb.READ, {
      namespaces: namespacesUsingWildcards,
    });

    data.scope._legacyList.forEach((comp) => {
      comp.id = BitId.parse(comp.id);
    });

    return data.scope._legacyList;
  }

  async show(bitId: BitId): Promise<Component | null | undefined> {
    const SHOW_COMPONENT = gql`
      query showLegacy($id: String!) {
        scope {
          _getLegacy(id: $id)
        }
      }
    `;
    const data = await this.graphClientRequest(SHOW_COMPONENT, Verb.READ, {
      id: bitId.toString(),
    });

    return Component.fromString(data.scope._getLegacy);
  }

  async deprecateMany(ids: string[]): Promise<Record<string, any>[]> {
    const DEPRECATE_COMPONENTS = gql`
      mutation deprecate($bitIds: [String!]!) {
        deprecate(bitIds: $bitIds) {
          bitIds
          missingComponents
        }
      }
    `;
    const res = await this.graphClientRequest(DEPRECATE_COMPONENTS, Verb.WRITE, {
      bitIds: ids,
    });
    return res.deprecate;
  }

  async undeprecateMany(ids: string[]): Promise<Record<string, any>[]> {
    const UNDEPRECATE_COMPONENTS = gql`
      mutation deprecate($bitIds: [String!]!) {
        undeprecate(bitIds: $bitIds) {
          bitIds
          missingComponents
        }
      }
    `;
    const res = await this.graphClientRequest(UNDEPRECATE_COMPONENTS, Verb.WRITE, {
      bitIds: ids,
    });

    return res.undeprecate;
  }

  async log(id: BitId): Promise<ComponentLog[]> {
    const GET_LOG_QUERY = gql`
      query getLogs($id: String!) {
        scope {
          getLogs(id: $id) {
            message
            username
            email
            date
            hash
            tag
          }
        }
      }
    `;

    const data = await this.graphClientRequest(GET_LOG_QUERY, Verb.READ, {
      id: id.toString(),
    });

    return data.scope.getLogs;
  }

  async latestVersions(bitIds: BitIds): Promise<string[]> {
    const GET_LATEST_VERSIONS = gql`
      query getLatestVersions($ids: [String]!) {
        scope {
          _legacyLatestVersions(ids: $ids)
        }
      }
    `;

    const data = await this.graphClientRequest(GET_LATEST_VERSIONS, Verb.READ, {
      ids: bitIds.map((id) => id.toString()),
    });

    return data.scope._legacyLatestVersions;
  }

  graph(): Promise<DependencyGraph> {
    throw new Error('Method not implemented.');
  }

  // TODO: ran (TBD)
  async listLanes(name?: string | undefined, mergeData?: boolean | undefined): Promise<LaneData[]> {
    const LIST_LANES = gql`
    query listLanes() {
      lanes {
        list()
      }
    }
    `;

    const res = await this.graphClientRequest(LIST_LANES, Verb.READ, {
      mergeData,
    });

    return res.lanes.list;
  }

  private getHeaders(headers: { [key: string]: string } = {}) {
    const authHeader = this.token ? getAuthHeader(this.token) : {};
    const localScope = this.localScopeName ? { 'x-request-scope': this.localScopeName } : {};
    return Object.assign(
      headers,
      authHeader,
      localScope,
      { connection: 'keep-alive' },
      { 'x-client-version': this.getClientVersion() }
    );
  }

  private getClientVersion(): string {
    return getHarmonyVersion();
  }

  private addAgentIfExist(opts: { [key: string]: any } = {}): Record<string, any> {
    const optsWithAgent = this.agent ? Object.assign({}, opts, { agent: this.agent }) : opts;
    return optsWithAgent;
  }

  static async connect(host: string, scopeName: string, localScopeName?: string) {
    const token = Http.getToken();
    const headers = token ? getAuthHeader(token) : {};
    const proxyConfig = await Http.getProxyConfig();
    const agent = await Http.getAgent(host, proxyConfig);
    const graphQlUrl = `${host}/graphql`;
    const graphQlFetcher = await getFetcherWithAgent(graphQlUrl);
    const graphClient = new GraphQLClient(graphQlUrl, { headers, fetch: graphQlFetcher });
    return new Http(graphClient, token, host, scopeName, proxyConfig, agent, localScopeName);
  }
}

export function getAuthHeader(token: string) {
  return {
    Authorization: `${DEFAULT_AUTH_TYPE} ${token}`,
  };
}

/**
 * Read the proxy config from the global config, and wrap fetch with fetch with proxy
 */
export async function getFetcherWithAgent(uri: string) {
  const proxyConfig = await Http.getProxyConfig();
  const agent = await Http.getAgent(uri, proxyConfig);
  const fetcher = agent ? wrapFetcherWithAgent(agent) : fetch;
  return fetcher;
}

/**
 * return a fetch wrapper with the proxy agent inside
 * @param proxyAgent
 */
export function wrapFetcherWithAgent(agent: Agent) {
  return (url, opts) => {
    const actualOpts = Object.assign({}, opts, { agent });
    return fetch(url, actualOpts);
  };
}

export function getProxyAgent(proxy: string): HttpsProxyAgent {
  const proxyAgent = new HttpsProxyAgent(proxy);
  return proxyAgent;
}

export function getAuthDataFromHeader(authorizationHeader: string | undefined): AuthData | undefined {
  if (!authorizationHeader) return undefined;
  const authorizationSplit = authorizationHeader.split(' ');
  if (authorizationSplit.length !== 2) {
    throw new Error(
      `fatal: HTTP Authorization header "${authorizationHeader}" is invalid. it should have exactly one space`
    );
  }
  return { type: authorizationSplit[0], credentials: authorizationSplit[1] };
}
