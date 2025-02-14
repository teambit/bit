import type { ReactNode, ComponentType } from 'react';
import { SsrSession } from './ssr-session';

export type ContextProps<T = unknown> = { renderCtx?: T; children: ReactNode };

export type ServerRenderPlugin<RenderCtx = unknown> = {
  /** identifies plugin data during serialization / deserialization */
  key?: string;

  /**
   * Initialize a context state for this specific rendering.
   * Context state will only be available to the current Aspect, in the other hooks, as well as a prop to the react context component.
   */
  serverInit?: (session: SsrSession) => RenderCtx | void | undefined | Promise<RenderCtx | void | undefined>;

  /**
   * Executes before running ReactDOM.renderToString(). Return value will replace the existing context state.
   */
  onBeforeRender?: (
    ctx: RenderCtx,
    app: ReactNode
  ) => RenderCtx | void | undefined | Promise<RenderCtx | void | undefined>;

  /**
   * Produce html assets. Runs after the body is rendered, and before rendering the final html.
   * @returns
   * json: will be rendered to the dom as a `<script type="json"/>`.
   * More assets will be available in the future.
   */
  serialize?: (ctx: RenderCtx, app: ReactNode) => { json: string } | Promise<{ json: string }> | undefined;

  /**
   * Wraps dom with a context. Will receive render context, produced by `onBeforeRender()`
   */
  reactServerContext?: ComponentType<ContextProps<RenderCtx>>;

  /**
   * Unified React Decorator. Will receive render context, produced by `onBeforeRender()` (server-side) or `deserialize()` (browser)
   */
  reactContext?: ComponentType<ContextProps<RenderCtx>>;
};

export type ClientRenderPlugin<RenderCtx = unknown, Deserialized = unknown> = {
  /** identifies plugin data during serialization / deserialization */
  key?: string;

  /**
   * Converts serialized data from raw string back to structured data.
   * @example deserialize: (data) => { const parsed = JSON.parse(data); return { analytics: new AnalyticsService(parsed); } }
   */
  deserialize?: (data?: string) => Deserialized;

  /**
   * Initialize the context state for client side rendering.
   * Context state will only be available to the current Aspect, in the other hooks, as well as a prop to the react context component.
   */
  browserInit?: (
    deserializedData: Deserialized,
    metadata?: {
      host?: string;
    }
  ) => RenderCtx | void | undefined | Promise<RenderCtx | void | undefined>;

  /**
   * Executes before running ReactDOM.hydrate() (or .render() in case server side rendering is skipped). Receives the context produced by `deserialize()`
   */
  onBeforeHydrate?: (
    context: RenderCtx,
    app: ReactNode
  ) => RenderCtx | void | undefined | Promise<RenderCtx | void | undefined>;
  /**
   * Executes after browser rendering is complete. Receives context from the previous steps.
   * @example onHydrate: (ref, { analytics }) => { analytics.reportPageView() }
   */
  onHydrate?: (context: RenderCtx, ref: HTMLElement | null) => void;

  /**
   * Wraps dom with a context. Will receive render context, loaded by `deserialize()`
   */
  reactClientContext?: ComponentType<ContextProps<RenderCtx>>;

  /**
   * Unified React Decorator. Will receive render context, produced by `onBeforeRender()` (server-side) or `deserialize()` (browser)
   */
  reactContext?: ComponentType<ContextProps<RenderCtx>>;
};

/** Unified plugin for each step of the SSR and CSR lifecycle */
export interface RenderPlugin<RenderCtx = unknown, Deserialized = unknown>
  extends ServerRenderPlugin<RenderCtx>,
    ClientRenderPlugin<RenderCtx, Deserialized> {
  /**
   * Unified React Decorator. Will receive render context, produced by `onBeforeRender()` (server-side) or `deserialize()` (browser)
   */
  reactContext?: ComponentType<ContextProps<RenderCtx>>;
}
