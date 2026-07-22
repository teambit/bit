import path from 'path';
import Module from 'module';

// the .js extension loader as it is at bootstrap, before any require hook (e.g. @babel/register
// registered by a tester running in this process) replaces it. the pristine loader knows to
// handle require() of ESM files natively (node >= 22.12), a capability such hooks break.
const pristineJsLoader = (Module as any)._extensions?.['.js'];

function isEsmSyntaxError(err: any): boolean {
  if (err?.code === 'ERR_REQUIRE_ESM') return true;
  return (
    err instanceof SyntaxError &&
    /Unexpected token 'export'|Cannot use import statement|Unexpected reserved word/.test(err.message || '')
  );
}

export function hookRequire() {
  module.constructor.prototype.require = function (id: string) {
    if (typeof id !== 'string') throw new Error('hookRequire - id must be a string');
    if (!id) throw new Error('hookRequire - missing id');

    // TODO: this should be refactored away to be handled by the dev.
    if (id.endsWith('.scss') || id.endsWith('.css') || id.endsWith('.less') || id === 'reset-css') {
      return {};
    }

    // This is a workaround for the issue described here: https://github.com/nodejs/node/issues/44663
    try {
      return this.constructor._load(id, this);
    } catch (firstErr: any) {
      // an ESM file failed to load as CJS. this happens when a require hook (e.g. @babel/register
      // left registered after the mocha tester ran in this process) hijacked the .js extension
      // loader and compiled the ESM source as a CJS script. retry once with the pristine loader,
      // which supports require() of ESM natively.
      if (isEsmSyntaxError(firstErr) && pristineJsLoader) {
        const extensions = (Module as any)._extensions;
        const hijackedLoader = extensions['.js'];
        if (hijackedLoader !== pristineJsLoader) {
          extensions['.js'] = pristineJsLoader;
          try {
            return this.constructor._load(id, this);
          } catch {
            throw firstErr;
          } finally {
            extensions['.js'] = hijackedLoader;
          }
        }
      }
      if (firstErr.code !== 'MODULE_NOT_FOUND') {
        throw firstErr;
      }
      try {
        const pkgJson = this.constructor._load(path.join(id, 'package.json'), this);
        if (!pkgJson.main || pkgJson.main === 'index.js') throw firstErr;
        return this.constructor._load(path.join(id, pkgJson.main), this);
      } catch {
        throw firstErr;
      }
    }
  };
}

hookRequire();
