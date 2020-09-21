/**
 * this is needed since the upgrade of ink to v3. this version added the react-dev-tools, which
 * sets the global window. other packages, e.g. Vue, check whether it's browser by checking the
 * global.window.
 */
export function requireWithUndefinedGlobalWindow(pkgName: string) {
  const previousGlobalWindow = global.window;
  // @ts-ignore
  global.window = undefined;
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const pkg = require(pkgName);
  global.window = previousGlobalWindow;
  return pkg;
}
