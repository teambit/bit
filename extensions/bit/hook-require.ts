export function hookRequire() {
  module.constructor.prototype.require = function (path) {
    if (typeof path !== 'string') throw new Error('hookRequire - path must be a string');
    if (!path) throw new Error('hookRequire - missing path');

    if (path.includes('.scss')) {
      return {};
    }

    return this.constructor._load(path, this);
  };
}

hookRequire();
