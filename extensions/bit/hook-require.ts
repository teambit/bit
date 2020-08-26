import assert from 'assert';

export function hookRequire() {
  module.constructor.prototype.require = function (path) {
    assert(typeof path === 'string', 'path must be a string');
    assert(path, 'missing path');

    if (path.includes('.scss')) {
      return {};
    }

    return this.constructor._load(path, this);
  };
}

hookRequire();
