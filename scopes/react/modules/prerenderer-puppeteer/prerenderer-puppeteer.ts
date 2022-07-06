/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable no-console */
/* eslint-disable dot-notation */
import promiseLimit from 'promise-limit';
import puppeteer from 'puppeteer';

/*
 * forked as-is from:
 * 	https://github.com/JoshTheDerf/prerenderer
 * with minor modifications:
 * - waituntil ~> `waitUntil` to support puppeteer v14
 * - added types
 */

export type PuppeteerRendererOptions = {
  maxConcurrentRoutes?: number;
  inject?: boolean;
  injectProperty?: string;
  skipThirdPartyRequests?: boolean;
  renderAfterDocumentEvent?: string;
  renderAfterElementExists?: string;
  renderAfterTime?: number;
  consoleHandler?: (route: string, message: puppeteer.ConsoleMessage) => void;
  viewport?: puppeteer.Viewport;
  navigationOptions?: puppeteer.WaitForOptions;
  args?: string[];
};

const waitForRender = function (options: { renderAfterDocumentEvent?: string; renderAfterTime?: number }) {
  options = options || {};

  return new Promise<void>((resolve) => {
    // Render when an event fires on the document.
    if (options.renderAfterDocumentEvent) {
      // eslint-disable-next-line dot-notation
      if (window['__PRERENDER_STATUS'] && window['__PRERENDER_STATUS'].__DOCUMENT_EVENT_RESOLVED) resolve();
      document.addEventListener(options.renderAfterDocumentEvent, () => resolve());

      // Render after a certain number of milliseconds.
    } else if (options.renderAfterTime) {
      setTimeout(() => resolve(), options.renderAfterTime);

      // Default: Render immediately after page content loads.
    } else {
      resolve();
    }
  });
};

export default class CustomPuppeteerRenderer {
  private _puppeteer: puppeteer.Browser | null;
  private _rendererOptions: PuppeteerRendererOptions;

  constructor(rendererOptions?: PuppeteerRendererOptions) {
    this._puppeteer = null;
    this._rendererOptions = rendererOptions || {};

    if (this._rendererOptions.maxConcurrentRoutes == null) this._rendererOptions.maxConcurrentRoutes = 0;

    if (this._rendererOptions.inject && !this._rendererOptions.injectProperty) {
      this._rendererOptions.injectProperty = '__PRERENDER_INJECTED';
    }
  }

  async initialize() {
    try {
      // Workaround for Linux SUID Sandbox issues.
      if (process.platform === 'linux') {
        if (!this._rendererOptions.args) this._rendererOptions.args = [];

        if (this._rendererOptions.args.indexOf('--no-sandbox') === -1) {
          this._rendererOptions.args.push('--no-sandbox');
          this._rendererOptions.args.push('--disable-setuid-sandbox');
        }
      }

      this._puppeteer = await puppeteer.launch(this._rendererOptions);
    } catch (e) {
      console.error(e);
      console.error('[Prerenderer - PuppeteerRenderer] Unable to start Puppeteer');
      // Re-throw the error so it can be handled further up the chain. Good idea or not?
      throw e;
    }

    return this._puppeteer;
  }

  async handleRequestInterception(page: puppeteer.Page, baseURL: string) {
    await page.setRequestInterception(true);

    page.on('request', (req: { url: () => string; abort: () => void; continue: () => void }) => {
      // Skip third party requests if needed.
      if (this._rendererOptions.skipThirdPartyRequests) {
        if (!req.url().startsWith(baseURL)) {
          req.abort();
          return;
        }
      }

      req.continue();
    });
  }

  async renderRoutes(routes: string[], Prerenderer: { getOptions: () => any }) {
    const rootOptions = Prerenderer.getOptions();
    const options = this._rendererOptions;

    const limiter = promiseLimit(this._rendererOptions.maxConcurrentRoutes);

    const pagePromises = Promise.all(
      routes.map((route) =>
        limiter(async () => {
          if (!this._puppeteer) throw new Error('cannot use renderRoutes() before initialize()');
          const page = await this._puppeteer.newPage();

          if (options.consoleHandler) {
            page.on('console', (message) => options.consoleHandler?.(route, message));
          }

          if (options.inject) {
            await page.evaluateOnNewDocument(
              `(function () { window['${options.injectProperty}'] = ${JSON.stringify(options.inject)}; })();`
            );
          }

          const baseURL = `http://localhost:${rootOptions.server.port}`;

          // Allow setting viewport widths and such.
          if (options.viewport) await page.setViewport(options.viewport);

          await this.handleRequestInterception(page, baseURL);

          // Hack just in-case the document event fires before our main listener is added.
          if (options.renderAfterDocumentEvent) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            page.evaluateOnNewDocument(function (_options: { renderAfterDocumentEvent: string }) {
              window['__PRERENDER_STATUS'] = {};
              document.addEventListener(_options.renderAfterDocumentEvent, () => {
                window['__PRERENDER_STATUS'].__DOCUMENT_EVENT_RESOLVED = true;
              });
            }, this._rendererOptions);
          }

          const navigationOptions: puppeteer.WaitForOptions = {
            waitUntil: 'networkidle0',
            ...options.navigationOptions,
          };
          await page.goto(`${baseURL}${route}`, navigationOptions);

          // Wait for some specific element exists
          const { renderAfterElementExists } = this._rendererOptions;
          if (renderAfterElementExists && typeof renderAfterElementExists === 'string') {
            await page.waitForSelector(renderAfterElementExists);
          }
          // Once this completes, it's safe to capture the page contents.
          // @ts-ignore
          await page.evaluate(waitForRender, this._rendererOptions);

          const result = {
            originalRoute: route,
            route: await page.evaluate('window.location.pathname'),
            html: await page.content(),
          };

          await page.close();
          return result;
        })
      )
    );

    return pagePromises;
  }

  destroy() {
    if (this._puppeteer) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._puppeteer.close();
      } catch (e) {
        console.error(e);
        console.error('[Prerenderer - PuppeteerRenderer] Unable to close Puppeteer');

        throw e;
      }
    }
  }
}
