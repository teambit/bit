import React from 'react';
import type { ReactNode, ComponentType, PropsWithChildren } from 'react';
import { merge } from 'webpack-merge';
import compact from 'lodash.compact';
import ReactDOMServer from 'react-dom/server';
import { Html, MountPoint } from '@teambit/ui-foundation.ui.rendering.html';
import type { HtmlProps, Assets } from '@teambit/ui-foundation.ui.rendering.html';
import { Composer, Wrapper } from '@teambit/base-ui.utils.composer';
import { ServerRenderPlugin } from './render-plugins';
import { SsrSession } from './ssr-session';

interface HtmlTemplate extends React.FC<HtmlProps> {
  fillContent: (rawHtml: string, content: string) => string;
}

export type ServerRendererOptions = {
  htmlTemplate: HtmlTemplate;
  mountPoint: ComponentType<PropsWithChildren<{}>>;
};

const defaultOptions: ServerRendererOptions = {
  htmlTemplate: Html,
  mountPoint: MountPoint,
};

export class ServerRenderer {
  options: ServerRendererOptions;
  constructor(
    /** effect rendering at key triggers. keep order consistent between server and browser */
    private plugins: ServerRenderPlugin<any>[],
    options?: Partial<ServerRendererOptions>
  ) {
    this.options = { ...options, ...defaultOptions };
  }

  /** render dehydrated server-side */
  async render(children: ReactNode, session: SsrSession): Promise<string> {
    // (1) init
    let renderContexts = await this.triggerServerInit(session);

    // (2) make React dom
    const reactContexts = this.getReactContexts(renderContexts);
    const MountPointComponent = this.options.mountPoint;
    const app = (
      <MountPointComponent>
        <Composer components={reactContexts}>{children}</Composer>
      </MountPointComponent>
    );

    renderContexts = await this.triggerBeforeRender(renderContexts, app);

    // (3) render (to string)
    const renderedApp = ReactDOMServer.renderToString(app);

    // (*) serialize state
    const realtimeAssets = await this.serialize(renderContexts, app);
    // @ts-ignore // TODO upgrade 'webpack-merge'
    const totalAssets = merge(session.assets, realtimeAssets) as Assets;

    // (4) render html-template (to string)
    const Template = this.options.htmlTemplate;
    const html = <Template assets={totalAssets} withDevTools fullHeight ssr />;
    const renderedHtml = `<!DOCTYPE html>${ReactDOMServer.renderToStaticMarkup(html)}`;
    const fullHtml = Template.fillContent(renderedHtml, renderedApp);

    // (5) serve
    return fullHtml;
  }

  private triggerServerInit(session: SsrSession) {
    const { plugins } = this;
    const promises = plugins.map((plugin) => plugin.serverInit?.(session));
    return Promise.all(promises);
  }

  private async triggerBeforeRender(renderContexts: any[], app: JSX.Element) {
    const { plugins } = this;

    const promises = plugins.map(async (plugin, idx) => {
      const ctx = renderContexts[idx];
      const nextCtx = await plugin.onBeforeRender?.(ctx, app);
      return nextCtx || ctx;
    });

    await Promise.all(promises);

    return renderContexts;
  }

  private getReactContexts(renderContexts: any[]): Wrapper[] {
    const { plugins } = this;

    return compact(
      plugins.map((plugin, idx) => {
        const renderCtx = renderContexts[idx];
        const props = { renderCtx };

        const decorator = plugin.reactServerContext || plugin.reactContext;
        if (!decorator) return undefined;
        return [decorator, props];
      })
    );
  }

  private async serialize(renderContexts: any[], app: ReactNode): Promise<Assets> {
    const { plugins } = this;
    const json: Record<string, string> = {};

    const promises = plugins.map(async (plugin, idx) => {
      if (!('serialize' in plugin)) return;
      if (!plugin.key) throw new Error('Key is required for .serialize()');

      const renderCtx = renderContexts[idx];
      const result = await plugin.serialize?.(renderCtx, app);

      if (!result) return;
      if (result.json) json[plugin.key] = result.json;
    });

    await Promise.all(promises);

    // more assets will be available in the future
    return { json };
  }
}
