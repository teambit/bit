import path from 'path';

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
      if (firstErr.code !== 'MODULE_NOT_FOUND') {
        throw firstErr;
      }
      try {
        const pkgJson = this.constructor._load(path.join(id, 'package.json'), this);
        if (!pkgJson.main || pkgJson.main === 'index.js') throw firstErr;
        return this.constructor._load(path.join(id, pkgJson.main), this);
      } catch {
        // Last resort for Bit's own core-aspect packages (`@teambit/*`). In a workspace where
        // these are source components (most notably the Bit repo itself), an env loaded from
        // root node_modules can eagerly `require('@teambit/builder')` during `bit install` —
        // before the workspace component is compiled — so the resolved copy's `dist` main
        // doesn't exist yet and the require above hard-crashes. Bit's own installation always
        // ships a compiled copy of its core aspects, so re-resolve from this module's context
        // (inside `@teambit/bit`) and load that instead of failing. Only runs on the crash
        // path, so the happy path (dist present, e.g. every normal user workspace) is untouched.
        if (id.startsWith('@teambit/')) {
          try {
            const fromBitContext = require.resolve(id, { paths: [__dirname] });
            return this.constructor._load(fromBitContext, this);
          } catch {
            throw firstErr;
          }
        }
        throw firstErr;
      }
    }
  };
}

hookRequire();
