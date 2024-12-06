import { ClientError, gql, GraphQLClient } from 'graphql-request';
import nodeFetch from '@pnpm/node-fetch';
import retry from 'async-retry';
import readLine from 'readline';
import HttpAgent from 'agentkeepalive';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { CLOUD_IMPORTER, CLOUD_IMPORTER_V2, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';
import { LaneId } from '@teambit/lane-id';
import { getAgent, AgentOptions } from '@teambit/toolbox.network.agent';
import { ListScopeResult } from '@teambit/legacy.component-list';
import { Network } from '../network';
import { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import { LaneData } from '@teambit/legacy.scope';
import { ComponentLog } from '@teambit/scope.objects';
import { ScopeDescriptor } from '@teambit/legacy.scope';
import { globalFlags } from '@teambit/cli';
import { getSync, list } from '@teambit/legacy.global-config';
import {
  CFG_HTTPS_PROXY,
  CFG_PROXY,
  CFG_USER_TOKEN_KEY,
  CFG_PROXY_CA,
  CFG_PROXY_CA_FILE,
  CFG_PROXY_CERT,
  CFG_PROXY_KEY,
  CFG_PROXY_NO_PROXY,
  CFG_PROXY_STRICT_SSL,
  CFG_FETCH_RETRIES,
  CFG_FETCH_RETRY_FACTOR,
  CFG_FETCH_RETRY_MINTIMEOUT,
  CFG_FETCH_RETRY_MAXTIMEOUT,
  CFG_FETCH_TIMEOUT,
  CFG_LOCAL_ADDRESS,
  CFG_MAX_SOCKETS,
  CFG_NETWORK_CONCURRENCY,
  CFG_NETWORK_CA,
  CFG_NETWORK_CA_FILE,
  CFG_NETWORK_CERT,
  CFG_NETWORK_KEY,
  CFG_NETWORK_STRICT_SSL,
  CENTRAL_BIT_HUB_URL_IMPORTER,
  CENTRAL_BIT_HUB_URL_IMPORTER_V2,
} from '@teambit/legacy.constants';
import { logger } from '@teambit/legacy.logger';
import { ObjectItemsStream, ObjectList } from '@teambit/scope.objects';
import { FETCH_OPTIONS, PushOptions } from '@teambit/legacy.scope-api';
import { remoteErrorHandler } from '../remote-error-handler';
import { HttpInvalidJsonResponse } from '../exceptions/http-invalid-json-response';
import { RemovedObjects } from '@teambit/legacy.scope';
import { GraphQLClientError } from '../exceptions/graphql-client-error';
import { loader } from '@teambit/legacy.loader';
import { UnexpectedNetworkError } from '../exceptions';
import { getBitVersion } from '@teambit/bit.get-bit-version';

const _fetch: typeof fetch = nodeFetch as unknown as typeof fetch;

export enum Verb {
  WRITE = 'write',
  READ = 'read',
}

export type ExportOrigin = 'export' | 'sign' | 'update-dependencies' | 'lane-merge' | 'tag';

export type PushCentralOptions = {
  origin: ExportOrigin;
  signComponents?: string[]; // relevant for bit-sign.
  idsHashMaps?: { [hash: string]: string }; // relevant for bit-sign. keys are the component hash, values are component-ids as strings

  /**
   * @deprecated prefer using "origin"
   */
  sign?: boolean;
};

export type ProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: boolean | string;
};

export type NetworkConfig = {
  fetchRetries?: number;
  fetchRetryFactor?: number;
  fetchRetryMintimeout?: number;
  fetchRetryMaxtimeout?: number;
  fetchTimeout?: number;
  localAddress?: string;
  maxSockets?: number;
  networkConcurrency?: number;
  strictSSL?: boolean;
  ca?: string | string[];
  cafile?: string;
  cert?: string | string[];
  key?: string;
  userAgent?: string;
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
    private localScopeName?: string,
    private networkConfig?: NetworkConfig
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
      httpProxy,
      httpsProxy,
      noProxy: obj[CFG_PROXY_NO_PROXY],
    };
  }

  static async getNetworkConfig(): Promise<NetworkConfig> {
    const obj = await list();

    // Reading strictSSL from both network.strict-ssl and network.strict_ssl for backward compatibility.
    const strictSSL = obj[CFG_NETWORK_STRICT_SSL] ?? obj['network.strict_ssl'] ?? obj[CFG_PROXY_STRICT_SSL];
    const networkConfig = {
      fetchRetries: obj[CFG_FETCH_RETRIES] ?? 5,
      fetchRetryFactor: obj[CFG_FETCH_RETRY_FACTOR] ?? 10,
      fetchRetryMintimeout: obj[CFG_FETCH_RETRY_MINTIMEOUT] ?? 1000,
      fetchRetryMaxtimeout: obj[CFG_FETCH_RETRY_MAXTIMEOUT] ?? 60000,
      fetchTimeout: obj[CFG_FETCH_TIMEOUT] ?? 60000,
      localAddress: obj[CFG_LOCAL_ADDRESS],
      maxSockets: obj[CFG_MAX_SOCKETS] ?? 15,
      networkConcurrency: obj[CFG_NETWORK_CONCURRENCY] ?? 16,
      strictSSL: typeof strictSSL === 'string' ? strictSSL === 'true' : strictSSL,
      ca: obj[CFG_NETWORK_CA] ?? obj[CFG_PROXY_CA],
      cafile: obj[CFG_NETWORK_CA_FILE] ?? obj[CFG_PROXY_CA_FILE],
      cert: obj[CFG_NETWORK_CERT] ?? obj[CFG_PROXY_CERT],
      key: obj[CFG_NETWORK_KEY] ?? obj[CFG_PROXY_KEY],
    };
    logger.debug(
      `the next network configuration is used in network.http: ${JSON.stringify(
        {
          ...networkConfig,
          key: networkConfig.key ? 'set' : 'not set', // this is sensitive information, we should not log it
        },
        null,
        2
      )}`
    );
    return networkConfig;
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

  async deleteMany(
    ids: string[],
    force: boolean,
    context: Record<string, any>,
    idsAreLanes: boolean
  ): Promise<RemovedObjects> {
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
    const res = await _fetch(`${this.url}/${route}`, opts);
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
    const res = await _fetch(`${this.url}/${route}`, opts);
    await this.throwForNonOkStatus(res);
    const ids = await this.getJsonResponse(res);
    return ids;
  }

  async pushToCentralHub(
    objectList: ObjectList,
    options: PushCentralOptions
  ): Promise<{
    successIds: string[];
    failedScopes: string[];
    exportId: string;
    errors: { [scopeName: string]: string };
    metadata?: { jobs?: string[] };
  }> {
    const route = 'api/put';
    logger.debug(`Http.pushToCentralHub, started. url: ${this.url}/${route}. total objects ${objectList.count()}`);
    const pack = objectList.toTar();
    const opts = this.addAgentIfExist({
      method: 'post',
      body: pack,
      headers: this.getHeaders({ 'push-options': JSON.stringify(options), 'x-verb': Verb.WRITE }),
    });
    const res = await _fetch(`${this.url}/${route}`, opts);
    logger.debug(
      `Http.pushToCentralHub, completed. url: ${this.url}/${route}, status ${res.status} statusText ${res.statusText}`
    );

    // @ts-ignore TODO: need to fix this
    const results = await this.readPutCentralStream(res.body);
    if (!results.data) throw new Error(`HTTP results are missing "data" property`);
    if (results.data.isError) {
      throw new UnexpectedNetworkError(results.message);
    }
    await this.throwForNonOkStatus(res);
    return results.data;
  }

  async deleteViaCentralHub(
    ids: string[],
    options: { force?: boolean; idsAreLanes?: boolean } = {}
  ): Promise<RemovedObjects[]> {
    const route = 'api/delete';
    logger.debug(
      `Http.deleteViaCentralHub, started. url: ${this.url}/${route}. total ids ${ids.length}. options ${JSON.stringify(
        options,
        null,
        2
      )}`
    );
    const idsPerType = {
      componentIds: options.idsAreLanes ? undefined : ids,
      laneIds: options.idsAreLanes ? ids : undefined,
    };
    const opts = this.addAgentIfExist({
      method: 'post',
      body: JSON.stringify(idsPerType),
      headers: this.getHeaders({
        'Content-Type': 'application/json',
        'delete-options': JSON.stringify(options),
        'x-verb': Verb.WRITE,
      }),
    });
    const res = await _fetch(`${this.url}/${route}`, opts);
    logger.debug(
      `Http.deleteViaCentralHub, completed. url: ${this.url}/${route}, status ${res.status} statusText ${res.statusText}`
    );

    // @ts-ignore TODO: need to fix this
    const results = await this.readPutCentralStream(res.body);
    if (!results.data) throw new Error(`HTTP results are missing "data" property`);
    if (results.data.isError) {
      throw new UnexpectedNetworkError(results.message);
    }
    await this.throwForNonOkStatus(res);
    return [RemovedObjects.fromObjects(results.data)];
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
    const res = await _fetch(`${this.url}/${route}`, opts);
    await this.throwForNonOkStatus(res);
    const results = await this.getJsonResponse(res);
    return results;
  }

  async fetch(ids: string[], fetchOptions: FETCH_OPTIONS): Promise<ObjectItemsStream> {
    const route = 'api/scope/fetch';
    const getImporterUrl = () => {
      if (this.url.startsWith('http:') || this.url.includes('//localhost')) return undefined; // it's a local scope
      if (isFeatureEnabled(CLOUD_IMPORTER)) return CENTRAL_BIT_HUB_URL_IMPORTER;
      if (isFeatureEnabled(CLOUD_IMPORTER_V2)) return CENTRAL_BIT_HUB_URL_IMPORTER_V2;
      return undefined;
    };
    const importerUrl = getImporterUrl();
    const urlToFetch = importerUrl ? `${importerUrl}/${this.scopeName}` : `${this.url}/${route}`;
    // generate a random number of 6 digits to be used as the request ID, so it'll be easier to debug with the remote.
    const requestId = Math.floor(Math.random() * 1000000);
    const scopeData = `scopeName: ${this.scopeName}, url: ${urlToFetch}. requestId: ${requestId}`;
    logger.debug(`Http.fetch, ${scopeData}`);
    const body = JSON.stringify({
      ids,
      fetchOptions,
    });
    const headers = this.getHeaders({
      'Content-Type': 'application/json',
      'x-verb': Verb.READ,
      'x-bit-request-id': requestId.toString(),
    });
    const opts = this.addAgentIfExist({
      method: 'post',
      body,
      headers,
    });

    const res = await retry(
      async () => {
        const retiedRes = await _fetch(urlToFetch, opts);
        return retiedRes;
      },
      {
        retries: this.networkConfig?.fetchRetries,
        factor: this.networkConfig?.fetchRetryFactor,
        minTimeout: this.networkConfig?.fetchRetryMintimeout,
        maxTimeout: this.networkConfig?.fetchRetryMaxtimeout,
        onRetry: (e: any) => {
          logger.debug(`failed to fetch import with error: ${e?.message || ''}`);
        },
      }
    );
    // const res = await fetch(urlToFetch, opts);
    logger.debug(`Http.fetch got a response, ${scopeData}, status ${res.status}, statusText ${res.statusText}`);
    await this.throwForNonOkStatus(res);
    // @ts-ignore TODO: need to fix this
    const objectListReadable = ObjectList.fromTarToObjectStream(res.body);

    return objectListReadable;
  }

  private async getJsonResponse(res: Response) {
    try {
      return await res.json();
    } catch (err: any) {
      logger.error('failed response', res);
      throw new HttpInvalidJsonResponse(res.url);
    }
  }

  private async throwForNonOkStatus(res: Response) {
    if (res.ok) return;
    let jsonResponse;
    try {
      jsonResponse = await res.json();
    } catch (e: any) {
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

  private async graphClientRequest(
    query: string,
    verb: string = Verb.READ,
    variables?: Record<string, any>
  ): Promise<any> {
    logger.debug(`http.graphClientRequest, scope "${this.scopeName}", url "${this.url}", query ${query}`);
    try {
      this.graphClient.setHeader('x-verb', verb);
      return await this.graphClient.request(query, variables);
    } catch (err: any) {
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
      // this logger is super important for debugging if the export fails. it shows at what step the failure occurred
      logger.debug(`http, msg from central-hub: ${json.message}`);
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

  async listBackwardCompatible(namespacesUsingWildcards?: string | undefined): Promise<ListScopeResult[]> {
    const LIST_HARMONY = gql`
      query list($namespaces: [String!]) {
        scope {
          components(namespaces: $namespaces) {
            id {
              scope
              version
              name
            }
            deprecation {
              isDeprecate
            }
          }
        }
      }
    `;

    const data = await this.graphClientRequest(LIST_HARMONY, Verb.READ, {
      namespaces: namespacesUsingWildcards ? [namespacesUsingWildcards] : undefined,
    });

    data.scope.components.forEach((comp) => {
      comp.id = ComponentID.fromObject(comp.id);
      comp.deprecated = comp.deprecation.isDeprecate;
    });

    return data.scope.components;
  }

  async list(namespacesUsingWildcards?: string | undefined, includeDeleted = false): Promise<ListScopeResult[]> {
    if (!includeDeleted) return this.listBackwardCompatible(namespacesUsingWildcards);
    const LIST_HARMONY = gql`
      query list($namespaces: [String!], $includeDeleted: Boolean) {
        scope {
          components(namespaces: $namespaces, includeDeleted: $includeDeleted) {
            id {
              scope
              version
              name
            }
            aspects(include: ["teambit.component/remove"]) {
              id
              config
            }
            deprecation {
              isDeprecate
            }
          }
        }
      }
    `;

    let data: any;
    try {
      data = await this.graphClientRequest(LIST_HARMONY, Verb.READ, {
        namespaces: namespacesUsingWildcards ? [namespacesUsingWildcards] : undefined,
        includeDeleted,
      });
    } catch (err: any) {
      if (err.message.includes('Unknown argument') && err.message.includes('includeDeleted')) {
        loader.stop();
        logger.console(
          `error: the remote does not support the include-deleted flag yet, falling back to listing without deleted components`,
          'error',
          'red'
        );
        return this.listBackwardCompatible(namespacesUsingWildcards);
      }
      throw err;
    }

    data.scope.components.forEach((comp) => {
      const removeAspect = comp.aspects.find((aspect) => aspect.id === 'teambit.component/remove');
      comp.id = ComponentID.fromObject(comp.id);
      comp.deprecated = comp.deprecation.isDeprecate;
      comp.removed = removeAspect?.config?.removed;
    });

    return data.scope.components;
  }

  async show(bitId: ComponentID): Promise<Component | null | undefined> {
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

  async log(id: ComponentID): Promise<ComponentLog[]> {
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

  async latestVersions(bitIds: ComponentIdList): Promise<string[]> {
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

  async graph(bitId?: ComponentID): Promise<DependencyGraph> {
    const GRAPH_QUERY = gql`
      query graph($ids: [String], $filter: String) {
        graph(ids: $ids, filter: $filter) {
          nodes {
            id
            component {
              id {
                name
                version
                scope
              }
            }
          }
          edges {
            sourceId
            targetId
            dependencyLifecycleType
          }
        }
      }
    `;

    const { graph } = await this.graphClientRequest(GRAPH_QUERY, Verb.READ, {
      ids: bitId ? [bitId.toString()] : [],
    });

    const nodes = graph.nodes.map((node) => ({ idStr: node.id, bitId: ComponentID.fromObject(node.component.id) }));
    const edges = graph.edges.map((edge) => ({
      src: edge.sourceId,
      target: edge.targetId,
      depType: edge.dependencyLifecycleType === 'DEV' ? 'devDependencies' : 'dependencies',
    }));
    const oldGraph = DependencyGraph.buildFromNodesAndEdges(nodes, edges);
    return new DependencyGraph(oldGraph);
  }

  async listLanes(id?: string): Promise<LaneData[]> {
    const LIST_LANES = gql`
      query Lanes($ids: [String!]) {
        lanes {
          list(ids: $ids) {
            id {
              name
              scope
            }
            components: laneComponentIds {
              name
              scope
              version
            }
          }
        }
      }
    `;

    const res = await this.graphClientRequest(LIST_LANES, Verb.READ, { ids: id ? [id] : [] });

    return res.lanes.list.map((lane) => ({
      ...lane,
      id: LaneId.from(lane.id.name, lane.id.scope),
      components: lane.components.map((laneCompId) => ({
        id: ComponentID.fromObject(laneCompId),
        head: laneCompId.version,
      })),
    }));
  }

  async hasObjects(hashes: string[]): Promise<string[]> {
    const HAS_OBJECTS = gql`
      query hasObjects($hashes: [String!]) {
        scope {
          hasObjects(hashes: $hashes)
        }
      }
    `;
    const res = await this.graphClientRequest(HAS_OBJECTS, Verb.READ, { hashes });

    return res;
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
    return getBitVersion();
  }

  private addAgentIfExist(opts: { [key: string]: any } = {}): Record<string, any> {
    const optsWithAgent = this.agent ? Object.assign({}, opts, { agent: this.agent }) : opts;
    return optsWithAgent;
  }

  static async connect(host: string, scopeName: string, localScopeName?: string) {
    const token = Http.getToken();
    const headers = token ? getAuthHeader(token) : {};
    const proxyConfig = await Http.getProxyConfig();
    const networkConfig = await Http.getNetworkConfig();
    const agent = await Http.getAgent(host, {
      ...proxyConfig,
      ...networkConfig,
    });
    const graphQlUrl = `${host}/graphql`;
    const graphQlFetcher = await getFetcherWithAgent(graphQlUrl);
    const graphClient = new GraphQLClient(graphQlUrl, { headers, fetch: graphQlFetcher });
    return new Http(graphClient, token, host, scopeName, proxyConfig, agent, localScopeName, networkConfig);
  }
}

export function getAuthHeader(token: string) {
  return {
    Authorization: `${DEFAULT_AUTH_TYPE} ${token}`,
  };
}

export async function fetchWithAgent(uri: string, opts) {
  const fetcherWithAgent = await getFetcherWithAgent(uri);
  return fetcherWithAgent(uri, opts);
}

/**
 * Read the proxy config from the global config, and wrap fetch with fetch with proxy
 */
export async function getFetcherWithAgent(uri: string): Promise<typeof fetch> {
  const proxyConfig = await Http.getProxyConfig();
  const networkConfig = await Http.getNetworkConfig();
  const agent = await Http.getAgent(uri, {
    ...proxyConfig,
    ...networkConfig,
  });
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
    return _fetch(url, actualOpts);
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
