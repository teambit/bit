export function hookRequire() {
  module.constructor.prototype.require = function (path) {
    if (typeof path !== 'string') throw new Error('hookRequire - path must be a string');
    if (!path) throw new Error('hookRequire - missing path');

    // TODO: this should be refactored away to be handled by the dev.
    if (path.endsWith('.scss') || path.endsWith('.css') || path.endsWith('.less') || path === 'reset-css') {
      return {};
    }

    return this.constructor._load(path, this);
  };
}

hookRequire();
