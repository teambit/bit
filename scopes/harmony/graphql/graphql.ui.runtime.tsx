import React, { ReactNode } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime, BrowserData, RenderLifecycle } from '@teambit/ui';
import { ComponentID } from '@teambit/component';
import { InMemoryCache, IdGetterObj, NormalizedCacheObject } from 'apollo-cache-inmemory';
import ApolloClient, { ApolloQueryResult, QueryOptions } from 'apollo-client';
import { getDataFromTree } from '@apollo/react-ssr';
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

type RenderContext = {
  client: ApolloClient<any>;
};

type ClientOptions = { state?: NormalizedCacheObject };

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

  createClient(
    host: string = typeof window !== 'undefined' ? window.location.host : '/',
    { state }: ClientOptions = {}
  ) {
    const client = new ApolloClient({
      link: this.createApolloLink(host),
      cache: this.getCache({ state }),
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

  private getCache({ state }: { state?: NormalizedCacheObject } = {}) {
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
  Provider = ({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) => {
    const client = renderCtx?.client || this.client;
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  };

  SsrProvider({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) {
    if (!renderCtx?.client) throw new TypeError('Gql client is has not been initialized during SSR');
    const { client } = renderCtx;
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  }

  renderHooks: RenderLifecycle<RenderContext, { state?: NormalizedCacheObject }> = {
    serverInit: this.serverInit.bind(this),
    onBeforeRender: this.prePopulate.bind(this),
    serialize: this.serialize.bind(this),
    deserialize: this.deserialize.bind(this),
    browserInit: this.browserInit.bind(this),
    reactContext: typeof window !== 'undefined' ? this.Provider : this.SsrProvider,
  };

  private serverInit(browser?: BrowserData) {
    if (!browser) return undefined;

    // maybe we should use internal url?
    const serverUrl = browser.location.origin ? `${browser?.location.origin}/graphql` : 'http://localhost:3000/graphql';

    const client = this.createSsrClient({ serverUrl, cookie: browser?.cookie });

    const ctx: RenderContext = {
      client,
    };
    return ctx;
  }

  private browserInit({ state }: { state?: NormalizedCacheObject } = {}) {
    const client = this.createClient(undefined, { state });
    this._client = client;

    return { client };
  }

  /**
   * Eagerly and recursively execute all gql queries in the app.
   * Data will be available in gqlClient.extract()
   */
  private async prePopulate(ctx: RenderContext, app: ReactNode) {
    await getDataFromTree(app);
  }

  /**
   * stringify gql cache
   */
  private serialize(ctx?: RenderContext) {
    const client = ctx?.client;
    if (!client) return undefined;

    return {
      json: JSON.stringify(client.extract()),
    };
  }

  /**
   * parse raw gql cache to an object
   */
  private deserialize(raw?: string) {
    if (!raw) return { state: undefined };
    let state: NormalizedCacheObject | undefined;
    try {
      state = JSON.parse(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[GraphQL] failed deserializing state from DOM', e);
    }

    return { state };
  }

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
