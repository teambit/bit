import React, { ReactNode } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime, UIAspect, UiUI, BrowserData } from '@teambit/ui';
import { ComponentID } from '@teambit/component';
import { InMemoryCache, IdGetterObj, NormalizedCacheObject } from 'apollo-cache-inmemory';
import ApolloClient, { ApolloQueryResult, QueryOptions } from 'apollo-client';
import { ApolloProvider } from '@apollo/react-hooks';
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

  createClient(host: string = typeof window !== 'undefined' ? window.location.host : '/') {
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
      const domState = typeof document !== 'undefined' && document.getElementById(GraphqlAspect.id);

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
  Provider = ({ children }: { children: ReactNode }) => {
    return <GraphQLProvider client={this.client}>{children}</GraphQLProvider>;
  };

  SsrProvider({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) {
    if (!renderCtx?.client) throw new TypeError('Gql client is has not been initialized during SSR');
    const { client } = renderCtx;
    return <ApolloProvider client={client}>{children}</ApolloProvider>;
  }

  protected initRender(browser?: BrowserData) {
    if (!browser) return undefined;

    // maybe we should use internal url?
    const serverUrl = browser?.location.origin
      ? `${browser?.location.origin}/graphql`
      : 'http://localhost:3000/graphql';

    const client = this.createSsrClient({ serverUrl, cookie: browser?.cookie });

    const ctx: RenderContext = {
      client,
    };
    return ctx;
  }

  protected async prePopulate(ctx: RenderContext, app: ReactNode) {
    await getDataFromTree(app);
  }

  protected serialize(ctx?: RenderContext) {
    const client = ctx?.client;
    if (!client) return undefined;

    return {
      state: JSON.stringify(client.extract()),
    };
  }

  static dependencies = [UIAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<GraphQLServer>()];

  static async provider([uiUi]: [UiUI], config, [serverSlot]: [GraphQLServerSlot]) {
    const graphqlUI = new GraphqlUI(serverSlot);

    const GqlContext = typeof window !== 'undefined' ? graphqlUI.Provider : graphqlUI.SsrProvider;
    uiUi.registerContext(GqlContext);
    uiUi.registerRenderHooks({
      init: graphqlUI.initRender.bind(graphqlUI),
      onBeforeRender: graphqlUI.prePopulate.bind(graphqlUI),
      onSerializeAssets: graphqlUI.serialize.bind(graphqlUI),
    });

    return graphqlUI;
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
