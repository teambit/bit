'use strict';
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : new P(function (resolve) {
              resolve(result.value);
            }).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g;
    return (
      (g = { next: verb(0), throw: verb(1), return: verb(2) }),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while (_)
        try {
          if (
            ((f = 1),
            y &&
              (t = op[0] & 2 ? y['return'] : op[0] ? y['throw'] || ((t = y['return']) && t.call(y), 0) : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (!((t = _.trys), (t = t.length > 0 && t[t.length - 1])) && (op[0] === 6 || op[0] === 2)) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
var state_1 = __importDefault(require('./state'));
// @ts-ignore
var volume_1 = require('memfs/lib/volume');
var console_1 = __importDefault(require('./console'));
// @ts-ignore
var unionfs_1 = require('unionfs');
var container_1 = require('./container');
var ContainerFactoryOptions = /** @class */ (function () {
  function ContainerFactoryOptions() {
    this.image = '';
    this.config = {};
  }
  return ContainerFactoryOptions;
})();
exports.ContainerFactoryOptions = ContainerFactoryOptions;
var Capsule = /** @class */ (function () {
  function Capsule(
    /**
     * container implementation the capsule is being executed within.
     */
    container,
    /**
     * the capsule's file system.
     */
    fs,
    /**
     * console for controlling process streams as stdout, stdin and stderr.
     */
    console,
    /**
     * capsule's state.
     */
    state
  ) {
    this.container = container;
    this.fs = fs;
    this.console = console;
    this.state = state;
  }
  Object.defineProperty(Capsule.prototype, 'id', {
    // implement this to handle capsules ids.
    get: function () {
      return '';
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(Capsule.prototype, 'containerId', {
    get: function () {
      return this.container.id;
    },
    enumerable: true,
    configurable: true,
  });
  Capsule.prototype.start = function () {
    return this.container.start();
  };
  Capsule.prototype.on = function (event, fn) {
    this.container.on(event, fn);
  };
  Capsule.prototype.updateFs = function (fs, fn) {
    var _this = this;
    Object.keys(fs).forEach(function (path) {
      // @ts-ignorex
      _this.fs.writeFile(path, fs[path], function () {
        if (Object.keys(fs).length === 1) fn();
      });
    });
  };
  Capsule.prototype.outputFile = function (file, data, options) {
    return this.container.outputFile(file, data, options);
  };
  Capsule.prototype.removePath = function (dir) {
    return this.container.removePath(dir);
  };
  Capsule.prototype.symlink = function (src, dest) {
    return this.container.symlink(src, dest);
  };
  Capsule.prototype.pause = function () {
    return this.container.pause();
  };
  Capsule.prototype.resume = function () {
    return this.container.resume();
  };
  Capsule.prototype.stop = function () {
    return this.container.stop();
  };
  Capsule.prototype.status = function () {
    return this.container.inspect();
  };
  Capsule.prototype.exec = function (command, options) {
    return __awaiter(this, void 0, Promise, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [4 /*yield*/, this.container.exec(__assign({ command: command.split(' ') }, options))];
          case 1:
            return [2 /*return*/, _a.sent()];
        }
      });
    });
  };
  Capsule.prototype.get = function (options) {
    return this.container.get(options);
  };
  Capsule.prototype.destroy = function () {
    return this.container.stop();
  };
  Capsule.buildFs = function (memFs, containerFs) {
    var fs = new unionfs_1.Union();
    fs.use(memFs).use(containerFs);
    return fs;
  };
  Capsule.create = function (containerFactory, volume, initialState, console) {
    if (volume === void 0) {
      volume = new volume_1.Volume();
    }
    if (initialState === void 0) {
      initialState = new state_1.default();
    }
    if (console === void 0) {
      console = new console_1.default();
    }
    return __awaiter(this, void 0, Promise, function () {
      var container, fs;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [4 /*yield*/, containerFactory({ image: this.image, config: this.config })];
          case 1:
            container = _a.sent();
            return [4 /*yield*/, container_1.ContainerFS.fromJSON(container, {})];
          case 2:
            fs = _a.sent();
            return [2 /*return*/, new this(container, this.buildFs(volume, fs), console, initialState)];
        }
      });
    });
  };
  /**
   * default capsule image.
   */
  Capsule.image = 'ubuntu';
  /**
   * default capsule config.
   */
  Capsule.config = {};
  return Capsule;
})();
exports.default = Capsule;
//# sourceMappingURL=module.js.map

//# sourceMappingURL={"version":3,"file":"module.js","sourceRoot":"","sources":["module.tsx"],"names":[],"mappings":"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"}
