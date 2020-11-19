import { ClientError, gql, GraphQLClient } from 'graphql-request';
import fetch, { Response } from 'node-fetch';
import { Network } from '../network';
import { BitId, BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { ListScopeResult } from '../../../consumer/component/components-list';
import DependencyGraph from '../../graph/scope-graph';
import { LaneData } from '../../lanes/lanes';
import { ComponentLog } from '../../models/model-component';
import { ScopeDescriptor } from '../../scope';
import globalFlags from '../../../cli/global-flags';
import { getSync } from '../../../api/consumer/lib/global-config';
import { CFG_USER_TOKEN_KEY } from '../../../constants';
import logger from '../../../logger/logger';
import { ObjectList } from '../../objects/object-list';
import { FETCH_OPTIONS } from '../../../api/scope/lib/fetch';
import { remoteErrorHandler } from '../remote-error-handler';
import { PushOptions } from '../../../api/scope/lib/put';
import { HttpInvalidJsonResponse } from '../exceptions/http-invalid-json-response';
import RemovedObjects from '../../removed-components';
import { GraphQLClientError } from '../exceptions/graphql-client-error';

export class Http implements Network {
  constructor(
    private graphClient: GraphQLClient,
    private _token: string | undefined | null,
    private url: string,
    private scopeName: string
  ) {}

  static getToken() {
    const processToken = globalFlags.token;
    const token = processToken || getSync(CFG_USER_TOKEN_KEY);
    if (!token) return null;

    return token;
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

    const data = await this.graphClientRequest(SCOPE_QUERY);

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
    const res = await fetch(`${this.url}/${route}`, {
      method: 'post',
      body,
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
    });
    await this.throwForNonOkStatus(res);
    const results = await this.getJsonResponse(res);
    return RemovedObjects.fromObjects(results);
  }

  async pushMany(objectList: ObjectList, pushOptions: PushOptions): Promise<string[]> {
    const route = 'api/scope/put';
    logger.debug(`Http.pushMany, url: ${this.url}/${route}  total objects ${objectList.count()}`);

    const pack = objectList.toTar();

    const res = await fetch(`${this.url}/${route}`, {
      method: 'POST',
      body: pack,
      headers: this.getHeaders({ 'push-options': JSON.stringify(pushOptions) }),
    });
    await this.throwForNonOkStatus(res);
    const ids = await this.getJsonResponse(res);
    return ids;
  }

  async action<Options, Result>(name: string, options: Options): Promise<Result> {
    const route = 'api/scope/action';
    logger.debug(`Http.action, url: ${this.url}/${route}`);
    const body = JSON.stringify({
      name,
      options,
    });
    const res = await fetch(`${this.url}/${route}`, {
      method: 'post',
      body,
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
    });
    await this.throwForNonOkStatus(res);
    const results = await this.getJsonResponse(res);
    return results;
  }

  async fetch(ids: string[], fetchOptions: FETCH_OPTIONS): Promise<ObjectList> {
    const route = 'api/scope/fetch';
    logger.debug(`Http.fetch, url: ${this.url}/${route}`);
    const body = JSON.stringify({
      ids,
      fetchOptions,
    });
    const res = await fetch(`${this.url}/${route}`, {
      method: 'post',
      body,
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
    });
    await this.throwForNonOkStatus(res);
    const objectList = await ObjectList.fromTar(res.body);
    return objectList;
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
    const err = remoteErrorHandler(
      error?.code,
      error,
      res.url,
      `url: ${res.url}. status: ${res.status}. text: ${res.statusText}`
    );
    throw err;
  }

  private async graphClientRequest(query: string, variables?: Record<string, any>) {
    logger.debug(`http.graphClientRequest, scope "${this.scopeName}", url "${this.url}", query ${query}`);
    try {
      return await this.graphClient.request(query, variables);
    } catch (err) {
      if (err instanceof ClientError) {
        throw new GraphQLClientError(err, this.url, this.scopeName);
      }
      // should not be here. it's just in case
      throw err;
    }
  }

  private getHeaders(headers: { [key: string]: string } = {}) {
    const authHeader = this.token ? getAuthHeader(this.token) : {};
    return Object.assign(headers, authHeader);
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

    const data = await this.graphClientRequest(LIST_LEGACY, {
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
    const data = await this.graphClientRequest(SHOW_COMPONENT, {
      id: bitId.toString(),
    });

    return Component.fromString(data.scope._getLegacy);
  }

  async deprecateMany(ids: string[]): Promise<Record<string, any>[]> {
    const DEPRECATE_COMPONENTS = gql`
      mutation deprecate($bitIds: [String!]!) {
        deprecate(bitIds: $bitIds)
      }
    `;
    const res = await this.graphClientRequest(DEPRECATE_COMPONENTS, {
      ids,
    });

    return res;
  }

  async undeprecateMany(ids: string[]): Promise<Record<string, any>[]> {
    const UNDEPRECATE_COMPONENTS = gql`
      mutation deprecate($bitIds: [String!]!) {
        undeprecate(bitIds: $bitIds)
      }
    `;
    const res = await this.graphClientRequest(UNDEPRECATE_COMPONENTS, {
      ids,
    });

    return res;
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

    const data = await this.graphClientRequest(GET_LOG_QUERY, {
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

    const data = await this.graphClientRequest(GET_LATEST_VERSIONS, {
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

    const res = await this.graphClientRequest(LIST_LANES, {
      mergeData,
    });

    return res.lanes.list;
  }

  static async connect(host: string, scopeName: string) {
    const token = Http.getToken();
    const headers = token ? getAuthHeader(token) : {};
    const graphClient = new GraphQLClient(`${host}/graphql`, { headers });
    return new Http(graphClient, token, host, scopeName);
  }
}

function getAuthHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
