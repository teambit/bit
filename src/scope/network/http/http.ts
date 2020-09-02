import { request, gql } from 'graphql-request';
import fetch from 'node-fetch';
import { Network } from '../network';
import { BitId, BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { ListScopeResult } from '../../../consumer/component/components-list';
import { RemoteLaneId } from '../../../lane-id/lane-id';
import CompsAndLanesObjects from '../../comps-and-lanes-objects';
import DependencyGraph from '../../graph/scope-graph';
import { LaneData } from '../../lanes/lanes';
import { ComponentLogs } from '../../models/model-component';
import { ScopeDescriptor } from '../../scope';
import { SSHConnectionStrategyName } from '../ssh/ssh';

export class Http implements Network {
  constructor(private scopeUrl: string) {}

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

  async pushMany(compsAndLanesObjects: CompsAndLanesObjects): Promise<string[]> {
    const route = 'api/scope/put';
    const body = compsAndLanesObjects.toString();

    const res = await fetch(`${this.scopeUrl}/${route}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain' },
    });

    const json = await res.json();

    return json;
  }

  async fetch(ids: Array<BitId | RemoteLaneId>, noDeps = false, idsAreLanes = false): Promise<CompsAndLanesObjects> {
    const route = 'api/scope/fetch';
    const body = JSON.stringify({
      ids: ids.map((id) => id.toString()),
      noDeps,
      idsAreLanes,
    });

    const res = await fetch(`${this.scopeUrl}/${route}`, {
      body,
      headers: { 'Content-Type': 'application/json' },
    });

    return CompsAndLanesObjects.fromString(res.text());
  }

  list(
    namespacesUsingWildcards?: string | undefined,
    strategiesNames?: SSHConnectionStrategyName[] | undefined
  ): Promise<ListScopeResult[]> {}

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

  deprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]> {
    throw new Error('Method not implemented.');
  }

  undeprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]> {
    throw new Error('Method not implemented.');
  }

  log(id: BitId): Promise<ComponentLogs> {
    throw new Error('Method not implemented.');
  }

  latestVersions(bitIds: BitIds): Promise<string[]> {
    throw new Error('Method not implemented.');
  }

  graph(bitId?: BitId | undefined): Promise<DependencyGraph> {
    throw new Error('Method not implemented.');
  }

  listLanes(name?: string | undefined, mergeData?: boolean | undefined): Promise<LaneData[]> {
    throw new Error('Method not implemented.');
  }

  private makeRequest() {}

  static async connect(host: string) {
    return new Http(host);
  }
}
