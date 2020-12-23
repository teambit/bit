import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { ComponentID } from '@teambit/component';
import { InMemoryCache, IdGetterObj, NormalizedCacheObject } from 'apollo-cache-inmemory';
import ApolloClient, { ApolloQueryResult, QueryOptions } from 'apollo-client';
import { ApolloProvider } from '@apollo/react-hooks';
import { ApolloLink } from 'apollo-link';
import { onError } from 'apollo-link-error';
import { HttpLink, createHttpLink } from 'apollo-link-http';
import { WebSocketLink } from 'apollo-link-ws';
import crossFetch from 'cross-fetch';

import { createLink } from './create-link';
import { GraphQLProvider } from './graphql-provider';
import { GraphQLServer } from './graphql-server';
import { GraphqlAspect } from './graphql.aspect';

export type GraphQLServerSlot = SlotRegistry<GraphQLServer>;

export class GraphqlUI {
  constructor(private remoteServerSlot: GraphQLServerSlot) {}

  private _client: ApolloClient<any> | undefined;

  get client() {
    if (!this._client) {
      this._client = this.createClient();
    }

    return this._client;
  }

  async query(options: QueryOptions): Promise<ApolloQueryResult<any>> {
    return this.client.query(options);
  }

  createClient(host: string = window.location.host) {
    const client = new ApolloClient({
      link: this.createApolloLink(host),
      cache: this.getCache({ restore: true }),
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
      cache: this.getCache(),
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

  private getCache({ restore }: { restore?: boolean } = {}) {
    const cache = new InMemoryCache({
      dataIdFromObject: getIdFromObject,
    });

    const restored = restore && this.restoreCacheFromDom();
    if (restored) cache.restore(restored);

    return cache;
  }

  private restoreCacheFromDom() {
    try {
      const domState = typeof document !== 'undefined' && document.getElementById('gql-cache');

      if (!domState) {
        console.log('no cache to load');
        return undefined;
      }

      const parsed = JSON.parse(domState.innerHTML) as NormalizedCacheObject;
      return parsed;
    } catch (e) {
      console.error('failing loading cache', e);
    }

    return undefined;
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
  getProvider = ({ children }: { children: JSX.Element }) => {
    return <GraphQLProvider client={this.client}>{children}</GraphQLProvider>;
  };

  getSsrProvider = () => {
    return ApolloProvider;
  };

  static runtime = UIRuntime;

  static slots = [Slot.withType<GraphQLServer>()];

  static async provider(deps, config, [serverSlot]: [GraphQLServerSlot]) {
    return new GraphqlUI(serverSlot);
  }
}

GraphqlAspect.addRuntime(GraphqlUI);

// TEMP!
function getIdFromObject(o: IdGetterObj) {
  switch (o.__typename) {
    case 'Component':
      return ComponentID.fromObject(o.id).toString();
    case 'ComponentHost':
      return 'ComponentHost';
    case 'ComponentID':
      return `id__${ComponentID.fromObject(o).toString()}`;
    case 'ReactDocs':
      return null;
    default:
      // @ts-ignore
      return o.__id || o.id || null;
  }
}
