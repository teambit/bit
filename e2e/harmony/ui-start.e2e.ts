import { expect } from 'chai';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { HttpHelper } from '../http-helper';

const SCOPE_PORT = 3030;
const WORKSPACE_PORT = 3031;

const SCOPE_UI_ROOT = 'teambit.scope/scope';
const WORKSPACE_UI_ROOT = 'teambit.workspace/workspace';

/** scripts and stylesheets the served document tells the browser to load */
function referencedAssets(html: string): string[] {
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);
  return [...scripts, ...styles];
}

/**
 * Sanity coverage for `bit start` itself: that the server comes up clean for each UI root, serves a
 * document, and that every asset that document asks for is actually reachable.
 *
 * This is deliberately end-to-end over http rather than unit-level. The failure modes it exists to
 * catch are all ones where each piece looks fine on its own - a document served from the wrong
 * filename, an asset emitted under a path the server does not expose, a root whose entry was never
 * built - and only the running server shows them.
 *
 * `--rebuild` throughout: without it the server serves the pre-built bundle from the installed bit
 * version, so the assertions would describe that release instead of the code under test.
 */
(IS_WINDOWS ? describe.skip : describe)('bit start', function () {
  this.timeout(0);

  describe('scope UI, on a bare scope', () => {
    let helper: Helper;
    let httpHelper: HttpHelper;
    let html: string;

    before(async () => {
      helper = new Helper();
      httpHelper = new HttpHelper(helper, SCOPE_PORT, {
        extraArgs: ['--rebuild'],
        uiRootAspectId: SCOPE_UI_ROOT,
      });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      await httpHelper.start();
      html = await (await fetch(`http://localhost:${SCOPE_PORT}/`)).text();
    });

    after(async () => {
      await httpHelper.killHttp();
      helper.scopeHelper.destroy();
    });

    it('should start without writing errors to stderr', () => {
      // `bit start` resolving does not by itself mean a clean startup - an aspect that failed to
      // load, or a plugin that threw, still lets the server listen.
      expect(httpHelper.stderr).to.not.match(/error|exception|unhandled/i);
    });

    it('should serve a document with a react root', () => {
      expect(html).to.have.string('<div id="root"');
    });

    it('should serve every asset the document references', async () => {
      const assets = referencedAssets(html);
      expect(assets, 'the document references no scripts at all').to.not.have.lengthOf(0);
      const statuses = await Promise.all(
        assets.map(async (asset) => {
          const response = await fetch(`http://localhost:${SCOPE_PORT}${asset}`);
          return `${asset} -> ${response.status}`;
        })
      );
      expect(statuses.filter((status) => !status.endsWith('-> 200'))).to.deep.equal([]);
    });

    it('should serve a document for a deep client-side route', async () => {
      // client-side routes have no file behind them; the history-api fallback is what answers, and
      // it has to name this root's document. `rendering=client` makes the ssr middleware call
      // `next()`, which is the only way to reach that fallback on this root.
      const response = await fetch(`http://localhost:${SCOPE_PORT}/some/deep/route?rendering=client`);
      expect(response.status).to.equal(200);
      const clientRenderedHtml = await response.text();
      expect(clientRenderedHtml).to.have.string('<div id="root"');
      // both UI roots are entries of one bundle, so there is no shared `index.html` and the server
      // falls back to `<root>.html`. get that name wrong and every client-side route 404s (or boots
      // the other root) while the ssr-rendered ones keep working - so it must load the scope entry.
      expect(clientRenderedHtml).to.match(/src="[^"]*\/scope\.[a-f0-9]+\.js"/);
    });

    it('should answer graphql queries', async () => {
      const response = await fetch(`http://localhost:${SCOPE_PORT}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      expect(response.status).to.equal(200);
      expect(await response.json()).to.not.have.property('errors');
    });

    // server-side rendering. these used to live in their own ui-ssr.e2e.ts, whose before hook was
    // identical to this one - including a whole `bit start --rebuild` - so they were merged here.
    //
    // the scope UI root is the only one built with `ssr: true`, and its ssr middleware swallows a
    // render failure by falling through to the client-rendered `index.html`. that fallback looks
    // identical to a working page in a browser, so a broken ssr bundle is invisible without asserting
    // on the *served html*. it is how "Invalid tag" (react #65), caused by `.cjs` modules being
    // emitted as assets in the ssr build, went unnoticed for months.
    describe('server-side rendering', () => {
      const renderedRoot = () => {
        const rendered = html.match(/<div id="root"[^>]*>([\s\S]*)<\/div>/);
        expect(rendered, 'no #root element in the served html').to.not.equal(null);
        return (rendered as RegExpMatchArray)[1];
      };

      it('should render the app on the server, not fall back to an empty client-rendered root', () => {
        // the client-only fallback is exactly `<div id="root"></div>`; anything ssr rendered puts
        // markup inside it. a 200 with valid html is returned either way.
        expect(html).to.not.have.string('<div id="root"></div>');
        expect(renderedRoot().trim()).to.not.have.lengthOf(0);
      });

      it('should not emit a module as an asset url where a component is expected', () => {
        // the "Invalid tag" symptom: an emitted asset path reaching react as a tag name.
        expect(html).to.not.match(/<\/?"?\/public\/ssr\//);
      });

      it('should render the scope name into the markup, not just the document title', () => {
        // deliberately scoped to the contents of `#root`: the static `index.html` already carries
        // the scope name in its `<title>`, so asserting on the whole document would pass even when
        // the ssr render failed and the client fallback was served.
        expect(renderedRoot()).to.have.string(helper.scopes.remote);
      });
    });
  });

  describe('workspace UI', () => {
    let helper: Helper;
    let httpHelper: HttpHelper;
    let html: string;

    before(async () => {
      helper = new Helper();
      httpHelper = new HttpHelper(helper, WORKSPACE_PORT, {
        extraArgs: ['--rebuild'],
        uiRootAspectId: WORKSPACE_UI_ROOT,
      });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      await httpHelper.start();
      html = await (await fetch(`http://localhost:${WORKSPACE_PORT}/`)).text();
    });

    after(async () => {
      await httpHelper.killHttp();
      helper.scopeHelper.destroy();
    });

    it('should start without writing errors to stderr', () => {
      expect(httpHelper.stderr).to.not.match(/error|exception|unhandled/i);
    });

    it('should serve a document with a react root', () => {
      expect(html).to.have.string('<div id="root"');
    });

    it("should serve its own entry, not another root's", () => {
      // both roots are entries of one bundle. serving the wrong document here would still return a
      // working-looking page - it would just boot the other root's app.
      const assets = referencedAssets(html);
      expect(
        assets.some((asset) => /\/workspace\.[a-f0-9]+\.js$/.test(asset)),
        `assets: ${assets.join(', ')}`
      ).to.be.true;
      expect(assets.some((asset) => /\/scope\.[a-f0-9]+\.js$/.test(asset))).to.be.false;
    });

    it('should serve every asset the document references', async () => {
      const assets = referencedAssets(html);
      expect(assets, 'the document references no scripts at all').to.not.have.lengthOf(0);
      const statuses = await Promise.all(
        assets.map(async (asset) => {
          const response = await fetch(`http://localhost:${WORKSPACE_PORT}${asset}`);
          return `${asset} -> ${response.status}`;
        })
      );
      expect(statuses.filter((status) => !status.endsWith('-> 200'))).to.deep.equal([]);
    });

    it('should serve a document for a deep client-side route', async () => {
      const response = await fetch(`http://localhost:${WORKSPACE_PORT}/some/deep/route`);
      expect(response.status).to.equal(200);
      expect(await response.text()).to.have.string('<div id="root"');
    });

    it('should answer graphql queries', async () => {
      const response = await fetch(`http://localhost:${WORKSPACE_PORT}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      expect(response.status).to.equal(200);
      expect(await response.json()).to.not.have.property('errors');
    });
  });
});
