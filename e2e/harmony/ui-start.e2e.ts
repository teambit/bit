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
      // it has to name this root's document.
      const response = await fetch(`http://localhost:${SCOPE_PORT}/some/deep/route?rendering=client`);
      expect(response.status).to.equal(200);
      expect(await response.text()).to.have.string('<div id="root"');
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

    it('should render the exported component into the served markup', () => {
      // the scope root is the one built with ssr, so its markup is filled in on the server. this is
      // the only root where the http response proves the app actually rendered.
      expect(html).to.have.string(helper.scopes.remote);
      expect(html).to.not.have.string('<div id="root"></div>');
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
