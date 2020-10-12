import { request, gql } from 'graphql-request';
import fetch, { Response } from 'node-fetch';
import { Network } from '../network';
import { BitId, BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { ListScopeResult } from '../../../consumer/component/components-list';
import DependencyGraph from '../../graph/scope-graph';
import { LaneData } from '../../lanes/lanes';
import { ComponentLogs } from '../../models/model-component';
import { ScopeDescriptor } from '../../scope';
import globalFlags from '../../../cli/global-flags';
import { getSync } from '../../../api/consumer/lib/global-config';
import { CFG_USER_TOKEN_KEY } from '../../../constants';
import logger from '../../../logger/logger';
import { ObjectList } from '../../objects/object-list';
import { FETCH_OPTIONS } from '../../../api/scope/lib/fetch';
import { remoteErrorHandler } from '../remote-error-handler';

export class Http implements Network {
  constructor(private scopeUrl: string) {}

  private _token: string | undefined | null;

  get token() {
    if (this._token === undefined) return this._token;
    const processToken = globalFlags.token;
    const token = processToken || getSync(CFG_USER_TOKEN_KEY);
    if (!token) this._token = null;

    return token;
  }

  get graphqlUrl() {
    return `${this.scopeUrl}/graphql`;
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

    const data = await request(this.graphqlUrl, SCOPE_QUERY);

    return {
      name: data.scope.name,
    };
  }

  async deleteMany(ids: string[], force: boolean, context: Record<string, any>, idsAreLanes: boolean) {
    const REMOVE_COMPONENTS = gql`
      query removeComponents($ids: [String], $force: Boolean, $lanes: Boolean) {
        remove(ids: $ids, force: $force, isLanes: $lanes)
      }
    `;

    const res = await request(this.graphqlUrl, REMOVE_COMPONENTS, {
      ids,
      force,
      idsAreLanes,
    });

    return res.removeComponents;
  }

  async pushMany(objectList: ObjectList): Promise<string[]> {
    const route = 'api/scope/put';
    logger.debug(`Http.pushMany, total objects ${objectList.count()}`);

    const pack = objectList.toTar();

    const res = await fetch(`${this.scopeUrl}/${route}`, {
      method: 'POST',
      body: pack,
    });
    await this.throwForNonOkStatus(res);
    const ids = await res.json();
    return ids;
  }

  async fetch(ids: string[], fetchOptions: FETCH_OPTIONS): Promise<ObjectList> {
    const route = 'api/scope/fetch';
    const body = JSON.stringify({
      ids,
      fetchOptions,
    });
    const res = await fetch(`${this.scopeUrl}/${route}`, {
      method: 'post',
      body,
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
    });
    await this.throwForNonOkStatus(res);
    const objectList = await ObjectList.fromTar(res.body);
    return objectList;
  }

  private async throwForNonOkStatus(res: Response) {
    if (!res.ok) {
      const response = await res.json();
      logger.error(`parsed error from HTTP, url: ${res.url}`, response);
      const error = response.error?.code ? response.error : response;
      const err = remoteErrorHandler(error.code, error, res.url, `status: ${res.status}. text: ${res.statusText}`);
      throw err;
    }
  }

  private getHeaders(headers: { [key: string]: string } = {}) {
    return Object.assign(headers, {
      Authorization: `Bearer ${this.token}`,
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

    const data = await request(this.graphqlUrl, LIST_LEGACY, {
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

    const data = await request(this.graphqlUrl, SHOW_COMPONENT, {
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
    const res = await request(this.graphqlUrl, DEPRECATE_COMPONENTS, {
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
    const res = await request(this.graphqlUrl, UNDEPRECATE_COMPONENTS, {
      ids,
    });

    return res;
  }

  // TODO: @david please fix this.
  async log(id: BitId): Promise<ComponentLogs> {
    const GET_LOG_QUERY = gql`
      query getLogs($id: String!) {
        scope {
          getLogs(id: $id) {
            message
            hash
            date
          }
        }
      }
    `;

    const data = await request(this.graphqlUrl, GET_LOG_QUERY, {
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

    const data = await request(this.graphqlUrl, GET_LATEST_VERSIONS, {
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

    const res = await request(this.graphqlUrl, LIST_LANES, {
      mergeData,
    });

    return res.lanes.list;
  }

  static async connect(host: string) {
    return new Http(host);
  }
}
