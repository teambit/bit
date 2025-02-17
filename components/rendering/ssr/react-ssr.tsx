import type { RenderPlugin } from './render-plugins';
import { BrowserRenderer } from './browser-renderer';
import type { BrowserRendererOptions } from './browser-renderer';
import { ServerRenderer } from './server-renderer';
import type { ServerRendererOptions } from './server-renderer';

export type ReactSsrOptions = Partial<ServerRendererOptions & BrowserRendererOptions>;

export class Ssr {
  constructor(
    // create array once, to keep consistent indexes between server and client
    private plugins: RenderPlugin<any, any>[],
    private options?: ReactSsrOptions
  ) {}
  private browser = new BrowserRenderer(this.plugins, this.options);
  private server = new ServerRenderer(this.plugins, this.options);

  renderServer = this.server.render.bind(this.server);
  renderBrowser = this.browser.render.bind(this.browser);
}
