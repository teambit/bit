import path from 'path';
import Module from 'module';

type ModuleWithLoad = typeof Module & { _load: (request: string, parent: unknown) => any };

const NodeModule = Module as ModuleWithLoad;

export function hookRequire() {
  // Reach for the `module` builtin explicitly rather than `module.constructor`. Under a bundler the
  // free `module` variable is the *bundler's* synthetic module record - a plain object - so
  // `module.constructor` is `Object`, and this assignment would install `require` on
  // `Object.prototype`. Every object in the process would then inherit an enumerable `require`,
  // which anything doing `for...in` (lodash's `omit`, pino's serializers, ...) picks up and calls.
  // the replacement only implements the call signature, not `resolve`/`cache`/... which node
  // attaches per-module rather than on the prototype - hence the cast.
  NodeModule.prototype.require = function (this: unknown, id: string) {
    if (typeof id !== 'string') throw new Error('hookRequire - id must be a string');
    if (!id) throw new Error('hookRequire - missing id');

    // TODO: this should be refactored away to be handled by the dev.
    if (id.endsWith('.scss') || id.endsWith('.css') || id.endsWith('.less') || id === 'reset-css') {
      return {};
    }

    // This is a workaround for the issue described here: https://github.com/nodejs/node/issues/44663
    try {
      return NodeModule._load(id, this);
    } catch (firstErr: any) {
      if (firstErr.code !== 'MODULE_NOT_FOUND') {
        throw firstErr;
      }
      try {
        const pkgJson = NodeModule._load(path.join(id, 'package.json'), this);
        if (!pkgJson.main || pkgJson.main === 'index.js') throw firstErr;
        return NodeModule._load(path.join(id, pkgJson.main), this);
      } catch {
        throw firstErr;
      }
    }
  } as unknown as NodeJS.Require;
}

hookRequire();
