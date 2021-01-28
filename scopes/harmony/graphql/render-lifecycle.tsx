import React, { ReactNode } from 'react';
import { getDataFromTree } from '@apollo/client/react/ssr';
import { NormalizedCacheObject } from '@apollo/client';
import pick from 'lodash.pick';

import { isBrowser } from '@teambit/ui.is-browser';
import type { BrowserData, RenderLifecycle } from '@teambit/ui';

import type { GraphqlUI, GraphQLClient } from './graphql.ui.runtime';
import { GraphQLProvider } from './graphql-provider';

type RenderContext = {
  client: GraphQLClient<any>;
};

const ALLOWED_HEADERS = ['cookie'];

export class GraphqlRenderLifecycle implements RenderLifecycle<RenderContext, { state?: NormalizedCacheObject }> {
  constructor(private graphqlUI: GraphqlUI) {}

  serverInit = ({ browser, server }: { browser?: BrowserData; server?: { port: number } } = {}) => {
    if (!browser) return undefined;

    const port = server?.port || 3000;
    const serverUrl = `http://localhost:${port}/graphql`;

    const client = this.graphqlUI.createSsrClient({
      serverUrl,
      headers: pick(browser.connection.headers, ALLOWED_HEADERS),
    });

    const ctx: RenderContext = { client };
    return ctx;
  };

  /**
   * Eagerly and recursively execute all gql queries in the app.
   * Data will be available in gqlClient.extract()
   */
  onBeforeRender = async (ctx: RenderContext, app: ReactNode) => {
    await getDataFromTree(app);
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

  browserInit = ({ state }: { state?: NormalizedCacheObject } = {}) => {
    const client = this.graphqlUI.createClient(window.location.host, { state });

    this.graphqlUI._setClient(client);

    return { client };
  };

  private BrowserGqlProvider = ({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) => {
    return <this.graphqlUI.getProvider client={renderCtx?.client}>{children}</this.graphqlUI.getProvider>;
  };

  reactContext = isBrowser ? this.BrowserGqlProvider : ServerGqlProvider;
}

function ServerGqlProvider({ renderCtx, children }: { renderCtx?: RenderContext; children: ReactNode }) {
  if (!renderCtx?.client) throw new TypeError('Gql client is has not been initialized during SSR');

  const { client } = renderCtx;
  return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
}
