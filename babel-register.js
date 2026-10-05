// the e2e suite is plain mocha (not `bit test`), so it needs its own TS->CJS transform.
// the config is passed explicitly rather than named `babel.config.js`: an auto-discovered
// root config is also picked up by @babel/register inside bit's own mocha tester, which
// then applies these presets to every component's `bit test` run in the workspace, while
// CI tests the compiled dist in a capsule and never sees it.
require('@babel/register')({
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  configFile: require.resolve('./babel.e2e.config.js'),
});
