import React, { ReactNode } from 'react';
// Calling getMarkupFromTree instead of getDataFromTree so we can control the render function
// This is required since upgrade to @apollo/client v3.6.9 because otherwise the ssr is not working since
// webpack is not bundling the react-dom/server
import { getMarkupFromTree } from '@apollo/client/react/ssr';
import ReactDOMServer from 'react-dom/server';
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import pick from 'lodash.pick';

import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import type { SSR } from '@teambit/ui';

import type { GraphqlUI, GraphQLClient } from './graphql.ui.runtime';
import { GraphQLProvider } from './graphql-provider';
import { GraphqlAspect } from './graphql.aspect';

type RenderContext = {
  client: GraphQLClient<any>;
};

const ALLOWED_HEADERS = ['cookie'];

export class GraphqlRenderPlugins implements SSR.RenderPlugin<RenderContext, { state?: NormalizedCacheObject }> {
  constructor(private graphqlUI: GraphqlUI) {}

  key = GraphqlAspect.id;

  serverInit = ({ browser }: SSR.SsrSession) => {
    const port = browser?.location.port || 3000;
    const serverUrl = `http://localhost:${port}/graphql`;

    const client = this.graphqlUI.createSsrClient({
      serverUrl,
      headers: pick(browser?.headers, ALLOWED_HEADERS),
    });

    const ctx: RenderContext = { client };
    return ctx;
  };

  /**
   * Eagerly and recursively execute all gql queries in the app.
   * Data will be available in gqlClient.extract()
   */
  onBeforeRender = async (ctx: RenderContext, app: ReactNode) => {
    await getMarkupFromTree({ tree: app, renderFunction: ReactDOMServer.renderToStaticMarkup });
  };

  serialize = (ctx?: RenderContext) => {
    const client = ctx?.client;
    if (!client) return undefined;

    return {
      json: JSON.stringify(client.extract()),
    };
  };

  deserialize = (raw?: string) => {
    if (!raw) return { state: undefined };
    let state: NormalizedCacheObject | undefined;
    try {
      state = JSON.parse(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[GraphQL] failed deserializing state from DOM', e);
    }

    return { state };
  };

  private _client: ApolloClient<NormalizedCacheObject> | undefined = undefined;

  browserInit = ({ state }: { state?: NormalizedCacheObject } = {}) => {
    const { location } = window;
    const isInsecure = location.protocol === 'http:';
    const wsUrl = `${isInsecure ? 'ws:' : 'wss:'}//${location.host}/subscriptions`;

    const client = this.graphqlUI.createClient('/graphql', { state, subscriptionUri: wsUrl });
    this._client = client;

    return { client };
  };

  getClient() {
    if (!this._client) return this.browserInit().client;
    return this._client;
  }

  private BrowserGqlProvider = ({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) => {
    if (!renderCtx?.client) throw new TypeError('GQL client is not initialized, make sure `.browserInit()` executes');

    return <this.graphqlUI.getProvider client={renderCtx?.client}>{children}</this.graphqlUI.getProvider>;
  };

  reactContext = isBrowser ? this.BrowserGqlProvider : ServerGqlProvider;
}

function ServerGqlProvider({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) {
  if (!renderCtx?.client)
    throw new TypeError('GQL client has not been initialized during SSR, make sure `.serverInit()` executes');

  const { client } = renderCtx;
  return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
}
