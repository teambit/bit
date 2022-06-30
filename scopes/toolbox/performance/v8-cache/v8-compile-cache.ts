// Copied from https://github.com/zertosh/v8-compile-cache and modified to be disabled on demand
import { FileSystemBlobStore } from './file-system-blob-store';

const Module = require('module');
const crypto = require('crypto');
const path = require('path');
const vm = require('vm');
const os = require('os');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      _v8CompileCache: {
        previousModuleCompile: ((content: string, filename: string) => any) | null;
        cachedModuleCompile: ((content: string, filename: string) => any) | null;
      };
    }
  }
}

global._v8CompileCache = global._v8CompileCache || {
  previousModuleCompile: null,
  cachedModuleCompile: null,
};

export class NativeCompileCache {
  private _cacheStore: FileSystemBlobStore;

  constructor(blobStore: FileSystemBlobStore) {
    this.setCacheStore(blobStore);
  }

  setCacheStore(cacheStore: FileSystemBlobStore) {
    this._cacheStore = cacheStore;
  }

  install() {
    if (global._v8CompileCache.previousModuleCompile || process.env.DISABLE_V8_COMPILE_CACHE || !supportsCachedData()) {
      return;
    }
    if (global._v8CompileCache.cachedModuleCompile) {
      global._v8CompileCache.previousModuleCompile = Module.prototype._compile;
      Module.prototype._compile = global._v8CompileCache.cachedModuleCompile;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const hasRequireResolvePaths = typeof require.resolve.paths === 'function';

    global._v8CompileCache.previousModuleCompile = Module.prototype._compile;
    Module.prototype._compile = function (content: string, filename: string) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const mod = this;

      function require(id) {
        return mod.require(id);
      }

      // https://github.com/nodejs/node/blob/v10.15.3/lib/internal/modules/cjs/helpers.js#L28
      function resolve(request, options) {
        return Module._resolveFilename(request, mod, false, options);
      }

      require.resolve = resolve;

      // https://github.com/nodejs/node/blob/v10.15.3/lib/internal/modules/cjs/helpers.js#L37
      // resolve.resolve.paths was added in v8.9.0
      if (hasRequireResolvePaths) {
        resolve.paths = function paths(request) {
          return Module._resolveLookupPaths(request, mod, true);
        };
      }

      require.main = process.mainModule;

      // Enable support to add extra extension types
      require.extensions = Module._extensions;
      require.cache = Module._cache;

      const dirname = path.dirname(filename);

      const compiledWrapper = self._moduleCompile(filename, content);

      // We skip the debugger setup because by the time we run, node has already
      // done that itself.

      // `Buffer` is included for Electron.
      // See https://github.com/zertosh/v8-compile-cache/pull/10#issuecomment-518042543
      const args = [mod.exports, require, mod, filename, dirname, process, global, Buffer];
      return compiledWrapper.apply(mod.exports, args);
    };
  }

  static uninstall() {
    if (global._v8CompileCache.previousModuleCompile) {
      global._v8CompileCache.cachedModuleCompile = Module.prototype._compile;
      Module.prototype._compile = global._v8CompileCache.previousModuleCompile;
      global._v8CompileCache.previousModuleCompile = null;
    }
  }

  _moduleCompile(filename: string, content: string) {
    // https://github.com/nodejs/node/blob/v7.5.0/lib/module.js#L511

    // Remove shebang
    const contLen = content.length;
    if (contLen >= 2) {
      // eslint-disable-next-line
      if (content.charCodeAt(0) === 35 /*#*/ && content.charCodeAt(1) === 33 /*!*/) {
        if (contLen === 2) {
          // Exact match
          content = '';
        } else {
          // Find end of shebang line and slice it off
          let i = 2;
          // eslint-disable-next-line no-plusplus
          for (; i < contLen; ++i) {
            const code = content.charCodeAt(i);
            // eslint-disable-next-line
            if (code === 10 /*\n*/ || code === 13 /*\r*/) break;
          }
          if (i === contLen) {
            content = '';
          } else {
            // Note that this actually includes the newline character(s) in the
            // new output. This duplicates the behavior of the regular
            // expression that was previously used to replace the shebang line
            content = content.slice(i);
          }
        }
      }
    }

    // create wrapper function
    const wrapper = Module.wrap(content);

    const invalidationKey = crypto.createHash('sha1').update(content, 'utf8').digest('hex');

    const buffer = this._cacheStore.get(filename, invalidationKey);

    const script = new vm.Script(wrapper, {
      filename,
      lineOffset: 0,
      displayErrors: true,
      cachedData: buffer,
      produceCachedData: true,
      // https://nodejs.org/api/vm.html#vm_new_vm_script_code_options
      importModuleDynamically() {
        throw new Error(
          '[v8-compile-cache] Dynamic imports are currently not supported. See https://github.com/zertosh/v8-compile-cache/issues/30 for more information. You should call `NativeCompileCache.uninstall()` before using dynamic imports.'
        );
      },
    });

    if (script.cachedDataProduced) {
      this._cacheStore.set(filename, invalidationKey, script.cachedData);
    } else if (script.cachedDataRejected) {
      this._cacheStore.delete(filename);
    }

    const compiledWrapper = script.runInThisContext({
      filename,
      lineOffset: 0,
      columnOffset: 0,
      displayErrors: true,
    });

    return compiledWrapper;
  }
}

function supportsCachedData(): boolean {
  const script = new vm.Script('""', { produceCachedData: true });
  // chakracore, as of v1.7.1.0, returns `false`.
  return script.cachedDataProduced === true;
}

function getCacheDir(): string {
  const v8_compile_cache_cache_dir = process.env.V8_COMPILE_CACHE_CACHE_DIR;
  if (v8_compile_cache_cache_dir) {
    return v8_compile_cache_cache_dir;
  }

  // Avoid cache ownership issues on POSIX systems.
  const dirname = typeof process.getuid === 'function' ? `v8-compile-cache-${process.getuid()}` : 'v8-compile-cache';
  const version =
    // eslint-disable-next-line no-nested-ternary
    typeof process.versions.v8 === 'string'
      ? process.versions.v8
      : typeof (process.versions as any).chakracore === 'string'
      ? `chakracore-${(process.versions as any).chakracore}`
      : `node-${process.version}`;
  return path.join(os.tmpdir(), dirname, version);
}

function getParentName(): string {
  // `module.parent.filename` is undefined or null when:
  //    * node -e 'require("v8-compile-cache")'
  //    * node -r 'v8-compile-cache'
  //    * Or, requiring from the REPL.
  return module.parent && typeof module.parent.filename === 'string' ? module.parent.filename : process.cwd();
}

// eslint-disable-next-line import/no-mutable-exports
export let nativeCompileCache: NativeCompileCache | null = null;

if (!process.env.DISABLE_V8_COMPILE_CACHE && supportsCachedData()) {
  const cacheDir = getCacheDir();
  const prefix = getParentName();
  const blobStore = new FileSystemBlobStore(cacheDir, prefix);
  nativeCompileCache = new NativeCompileCache(blobStore);

  process.once('exit', () => {
    if (blobStore.isDirty()) {
      blobStore.save();
    }
    NativeCompileCache.uninstall();
  });
}
