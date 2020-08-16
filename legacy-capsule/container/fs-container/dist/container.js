'use strict';
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
var fs_extra_1 = __importDefault(require('fs-extra'));
var os_1 = __importDefault(require('os'));
var uuid_1 = __importDefault(require('uuid'));
var path_1 = __importDefault(require('path'));
var child_process_1 = require('child_process');
var debug = require('debug')('fs-container');
var FsContainer = /** @class */ (function () {
  function FsContainer(path) {
    this.id = 'FS Container';
    this.path = path || this.generateDefaultTmpDir();
  }
  FsContainer.prototype.getPath = function () {
    return this.path;
  };
  FsContainer.prototype.composePath = function (pathToCompose) {
    return path_1.default.join(this.getPath(), pathToCompose);
  };
  FsContainer.prototype.generateDefaultTmpDir = function () {
    return path_1.default.join(os_1.default.tmpdir(), uuid_1.default());
  };
  FsContainer.prototype.outputFile = function (file, data, options) {
    var filePath = this.composePath(file);
    debug('writing file on ' + filePath);
    return fs_extra_1.default.outputFile(filePath, data, options);
  };
  FsContainer.prototype.removePath = function (dir) {
    var pathToRemove = this.composePath(dir);
    return fs_extra_1.default.remove(pathToRemove);
  };
  FsContainer.prototype.symlink = function (src, dest) {
    return __awaiter(this, void 0, Promise, function () {
      var srcPath, destPath;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            srcPath = this.composePath(src);
            destPath = this.composePath(dest);
            return [4 /*yield*/, fs_extra_1.default.ensureDir(path_1.default.dirname(destPath))];
          case 1:
            _a.sent();
            return [2 /*return*/, fs_extra_1.default.ensureSymlink(srcPath, destPath)];
        }
      });
    });
  };
  FsContainer.prototype.exec = function (execOptions) {
    return __awaiter(this, void 0, Promise, function () {
      var cwd, childProcess;
      var _this = this;
      return __generator(this, function (_a) {
        cwd = execOptions.cwd ? this.composePath(execOptions.cwd) : this.getPath();
        debug('executing the following command: ' + execOptions.command.join(' ') + ', on cwd: ' + cwd);
        childProcess = child_process_1.spawn(execOptions.command.shift(), execOptions.command, {
          cwd: cwd,
          shell: true,
        });
        childProcess.abort = function () {
          return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
              return [2 /*return*/, childProcess.kill()];
            });
          });
        };
        childProcess.inspect = function () {
          return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
              return [
                2 /*return*/,
                {
                  pid: childProcess.pid,
                  running: !childProcess.killed,
                },
              ];
            });
          });
        };
        return [2 /*return*/, childProcess];
      });
    });
  };
  FsContainer.prototype.get = function (options) {
    return __awaiter(this, void 0, Promise, function () {
      var filePath;
      return __generator(this, function (_a) {
        filePath = path_1.default.join(this.getPath(), options.path);
        return [2 /*return*/, fs_extra_1.default.createReadStream(filePath)];
      });
    });
  };
  FsContainer.prototype.put = function (files, options) {
    return __awaiter(this, void 0, Promise, function () {
      var baseDir, fsOptions, writeFilesP;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            baseDir = path_1.default.join(this.getPath(), options.path || '');
            return [4 /*yield*/, fs_extra_1.default.ensureDir(baseDir)];
          case 1:
            _a.sent();
            fsOptions = options.overwrite ? {} : { flag: 'wx' };
            writeFilesP = Object.keys(files).map(function (filePath) {
              return fs_extra_1.default.writeFile(path_1.default.join(baseDir, filePath), files[filePath], fsOptions);
            });
            return [4 /*yield*/, Promise.all(writeFilesP)];
          case 2:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  FsContainer.prototype.start = function () {
    return fs_extra_1.default.ensureDir(this.path);
  };
  // @ts-ignore
  FsContainer.prototype.inspect = function () {
    return __awaiter(this, void 0, Promise, function () {
      return __generator(this, function (_a) {
        return [2 /*return*/];
      });
    });
  };
  FsContainer.prototype.pause = function () {
    return __awaiter(this, void 0, Promise, function () {
      return __generator(this, function (_a) {
        return [2 /*return*/];
      });
    });
  };
  FsContainer.prototype.resume = function () {
    return __awaiter(this, void 0, Promise, function () {
      return __generator(this, function (_a) {
        return [2 /*return*/];
      });
    });
  };
  FsContainer.prototype.stop = function (ttl) {
    return fs_extra_1.default.remove(this.path);
  };
  FsContainer.prototype.destroy = function () {
    return __awaiter(this, void 0, Promise, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [4 /*yield*/, this.stop()];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  return FsContainer;
})();
exports.default = FsContainer;
//# sourceMappingURL=module.js.map

//# sourceMappingURL={"version":3,"file":"module.js","sourceRoot":"","sources":["module.tsx"],"names":[],"mappings":"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"}
