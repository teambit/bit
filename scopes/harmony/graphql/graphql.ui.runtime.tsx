import React, { ReactNode } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { ComponentID } from '@teambit/component';
import { isBrowser } from '@teambit/ui.is-browser';
import { InMemoryCache, IdGetterObj, NormalizedCacheObject } from 'apollo-cache-inmemory';
import ApolloClient, { ApolloQueryResult, QueryOptions } from 'apollo-client';
import { ApolloLink } from 'apollo-link';
import { onError } from 'apollo-link-error';
import { HttpLink, createHttpLink } from 'apollo-link-http';
import { WebSocketLink } from 'apollo-link-ws';
import crossFetch from 'cross-fetch';
import objectHash from 'object-hash';

import { createLink } from './create-link';
import { GraphQLProvider } from './graphql-provider';
import { GraphQLServer } from './graphql-server';
import { GraphqlAspect } from './graphql.aspect';
import { GraphqlRenderLifecycle } from './render-lifecycle';

export type GraphQLServerSlot = SlotRegistry<GraphQLServer>;
/**
 * Type of gql client.
 * Used to abstract Apollo client, so consumers could import the type from graphql.ui, and not have to depend on @apollo/client directly
 * */
export type GraphQLClient<T> = ApolloClient<T>;

type ClientOptions = { state?: NormalizedCacheObject };

export class GraphqlUI {
  constructor(private remoteServerSlot: GraphQLServerSlot) {}

  private _client?: GraphQLClient<any>;

  get client() {
    if (!this._client) {
      this._client = this.createClient();
    }

    return this._client;
  }

  /** internal. Sets the global gql client */
  _setClient(client: GraphQLClient<any>) {
    this._client = client;
  }

  async query(options: QueryOptions): Promise<ApolloQueryResult<any>> {
    return this.client.query(options);
  }

  createClient(host: string = isBrowser ? window.location.host : '/', { state }: ClientOptions = {}) {
    const client = new ApolloClient({
      link: this.createApolloLink(host),
      cache: this.createCache({ state }),
    });

    return client;
  }

  createSsrClient({ serverUrl, cookie }: { serverUrl: string; cookie?: any }) {
    const link = createHttpLink({
      credentials: 'same-origin',
      uri: serverUrl,
      headers: {
        cookie,
      },
      fetch: crossFetch,
    });

    const client = new ApolloClient({
      ssrMode: true,
      link,
      cache: this.createCache(),
    });

    return client;
  }

  registerRemote(server: GraphQLServer) {
    this.remoteServerSlot.register(server);
  }

  private createApolloLink(host: string) {
    return ApolloLink.from([
      onError(({ graphQLErrors, networkError }) => {
        if (graphQLErrors)
          graphQLErrors.forEach(({ message, locations, path }) =>
            // eslint-disable-next-line no-console
            console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`)
          );
        // eslint-disable-next-line no-console
        if (networkError) console.log(`[Network error]: ${networkError}`);
      }),
      this.createLink(host),
    ]);
  }

  private createCache({ state }: { state?: NormalizedCacheObject } = {}) {
    const cache = new InMemoryCache({
      dataIdFromObject: getIdFromObject,
    });

    if (state) cache.restore(state);

    return cache;
  }

  createLinks() {
    const servers = this.remoteServerSlot.values();

    return servers.map((server) => {
      return this.createLink(server.uri);
    });
  }

  createLink(host: string) {
    return createLink(this.createHttpLink(host), this.createWsLink(host));
  }

  private createHttpLink(host: string) {
    return new HttpLink({
      credentials: 'include',
      uri: `${(window.location.protocol === 'https:' ? 'https://' : 'http://') + host}/graphql`,
    });
  }

  private createWsLink(host: string) {
    return new WebSocketLink({
      uri: `${(window.location.protocol === 'https:' ? 'wss://' : 'ws://') + host}/subscriptions`,
      options: {
        reconnect: true,
      },
    });
  }

  /**
   * get the graphQL provider
   */
  getProvider = ({ client = this.client, children }: { client?: GraphQLClient<any>; children: ReactNode }) => {
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  };

  renderHooks = new GraphqlRenderLifecycle(this);

  static dependencies = [];

  static runtime = UIRuntime;

  static slots = [Slot.withType<GraphQLServer>()];

  static async provider(deps, config, [serverSlot]: [GraphQLServerSlot]) {
    const graphqlUI = new GraphqlUI(serverSlot);

    return graphqlUI;
  }
}

GraphqlAspect.addRuntime(GraphqlUI);

// good enough for now.
// generate unique id for each gql object, in order for cache to work.
function getIdFromObject(o: IdGetterObj) {
  return null;

  switch (o.__typename) {
    case 'Component':
      return `${o.__typename}_${ComponentID.fromObject(o.id).toString()}`;
    case 'ComponentHost':
      return 'ComponentHost';
    case 'ComponentID':
      return `${o.__typename}_${ComponentID.fromObject(o).toString()}`;
    default:
      // @ts-ignore
      if (typeof o.__id === 'string') return o.__id;

      if (typeof o.id === 'string') return `${o.__typename}_${o.id}`;
      if (typeof o.id === 'object') {
        try {
          // fallback until we will get dedicated string ids:
          return `${o.__typename}_${objectHash(o.id)}`;
        } catch {
          return null;
        }
      }
      return null;
  }
}
