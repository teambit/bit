import { expect } from 'chai';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { HttpHelper, uiE2eMode, uiE2eHttpHelperOptions } from '../http-helper';

const PORT = 3025;
const mode = uiE2eMode();

/**
 * The scope UI root is the only one built with `ssr: true`, and its ssr middleware swallows a render
 * failure by falling through to the client-rendered `index.html`. That fallback looks identical to a
 * working page in a browser, so a broken ssr bundle is invisible without asserting on the *served
 * html* - which is what this file does. It is how "Invalid tag" (react #65), caused by `.cjs` modules
 * being emitted as assets in the ssr build, went unnoticed for months.
 *
 * Skipped unless `BIT_E2E_UI_MODE` is set (`rebuild` or `prebuilt` - see `uiE2eMode` in
 * `../http-helper.ts` for what each does, why this suite opts out of the ordinary e2e sweep by
 * default, and the exact commands for both modes - including validating the real esbuild CLI
 * bundle with its baked-in ui/preview pre-bundle, not just this repo's dev binary).
 */
(IS_WINDOWS || !mode ? describe.skip : describe)('scope UI server-side rendering', function () {
  this.timeout(0);
  let helper: Helper;
  let httpHelper: HttpHelper;
  let html: string;
  let clientRenderedResponse: Response;
  let clientRenderedHtml: string;

  before(async () => {
    helper = new Helper();
    // `mode` is never undefined here: the describe block above is skipped entirely otherwise.
    httpHelper = new HttpHelper(helper, PORT, uiE2eHttpHelperOptions(helper, mode as NonNullable<typeof mode>));
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.populateComponents(1, false);
    helper.command.tagAllWithoutBuild();
    helper.command.export();
    await httpHelper.start();
    const response = await fetch(`http://localhost:${PORT}/`);
    html = await response.text();
    // `rendering=client` makes the ssr middleware call `next()`, which is the only way to reach the
    // history-api fallback - the document every client-side route is served from.
    clientRenderedResponse = await fetch(`http://localhost:${PORT}/some/client/route?rendering=client`);
    clientRenderedHtml = await clientRenderedResponse.text();
  });

  after(async () => {
    await httpHelper.killHttp();
    helper.scopeHelper.destroy();
  });

  it('should render the app on the server, not fall back to an empty client-rendered root', () => {
    // the client-only fallback is exactly `<div id="root"></div>`; anything ssr rendered puts markup
    // inside it. asserting on the emptiness is what distinguishes the two - a 200 with valid html is
    // returned either way.
    expect(html).to.not.have.string('<div id="root"></div>');
    const rendered = html.match(/<div id="root"[^>]*>([\s\S]*)<\/div>/);
    expect(rendered, 'no #root element in the served html').to.not.equal(null);
    expect((rendered as RegExpMatchArray)[1].trim()).to.not.have.lengthOf(0);
  });

  it('should not emit a module as an asset url where a component is expected', () => {
    // the "Invalid tag" symptom: an emitted asset path reaching react as a tag name.
    expect(html).to.not.match(/<\/?"?\/public\/ssr\//);
  });

  it("should serve this root's html for a client-side route", () => {
    // both UI roots are entries of one bundle, so there is no shared `index.html` and the server
    // falls back to `<root>.html`. get that name wrong and every client-side route 404s while the
    // ssr-rendered ones keep working, so this asserts the fallback specifically.
    expect(clientRenderedResponse.status).to.equal(200);
    expect(clientRenderedHtml).to.have.string('<div id="root">');
    // and it is this root's document: it must load the scope entry, not another root's
    expect(clientRenderedHtml).to.match(/src="[^"]*\/scope\.[a-f0-9]+\.js"/);
  });

  it('should render the scope name into the markup, not just the document title', () => {
    // deliberately scoped to the contents of `#root`: the static `index.html` already carries the
    // scope name in its `<title>`, so asserting on the whole document would pass even when the ssr
    // render failed and the client fallback was served.
    const rendered = html.match(/<div id="root"[^>]*>([\s\S]*)<\/div>/);
    expect(rendered, 'no #root element in the served html').to.not.equal(null);
    expect((rendered as RegExpMatchArray)[1]).to.have.string(helper.scopes.remote);
  });
});
