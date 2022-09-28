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
      } catch (err) {
        throw firstErr;
      }
    }
  };
}

hookRequire();
