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
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result['default'] = mod;
    return result;
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
var _this = this;
Object.defineProperty(exports, '__esModule', { value: true });
var mock = require('mock-fs');
var chai_1 = __importStar(require('chai'));
var path_1 = __importDefault(require('path'));
var container_1 = __importDefault(require('./container'));
chai_1.default.use(require('chai-fs'));
describe('FsContainer', function () {
  describe('start()', function () {
    describe('creating an instance without any path', function () {
      var container;
      before(function () {
        return __awaiter(_this, void 0, void 0, function () {
          return __generator(this, function (_a) {
            mock({});
            container = new container_1.default();
            container.start();
            return [2 /*return*/];
          });
        });
      });
      after(function () {
        mock.restore();
      });
      it('should create the fs directory', function () {
        chai_1.expect(container.getPath()).to.be.a.path();
      });
    });
    describe('creating an instance with a specific path', function () {
      var container;
      before(function () {
        return __awaiter(_this, void 0, void 0, function () {
          return __generator(this, function (_a) {
            mock({});
            container = new container_1.default('custom-path');
            container.start();
            return [2 /*return*/];
          });
        });
      });
      after(function () {
        mock.restore();
      });
      it('directory path should be the specified path', function () {
        chai_1.expect(container.getPath()).to.equal('custom-path');
      });
      it('should create the fs directory', function () {
        chai_1.expect(container.getPath()).to.be.a.path();
      });
    });
  });
  describe('stop()', function () {
    var container;
    before(function () {
      return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              mock({});
              container = new container_1.default();
              return [4 /*yield*/, container.start()];
            case 1:
              _a.sent();
              chai_1.expect(container.getPath()).to.be.a.path();
              return [4 /*yield*/, container.stop()];
            case 2:
              _a.sent();
              return [2 /*return*/];
          }
        });
      });
    });
    after(function () {
      mock.restore();
    });
    it('should delete the container directory', function () {
      chai_1.expect(container.getPath()).to.not.be.a.path();
    });
  });
  // @todo: exec doesn't work with mockFs :(
  describe('exec()', function () {
    var container;
    before(function () {
      return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              container = new container_1.default();
              return [4 /*yield*/, container.start()];
            case 1:
              _a.sent();
              chai_1.expect(container.getPath()).to.be.a.path();
              return [2 /*return*/];
          }
        });
      });
    });
    after(function () {
      return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.stop()];
            case 1:
              _a.sent();
              return [2 /*return*/];
          }
        });
      });
    });
    it('should return stdout', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              chai_1.expect(execResults).to.have.property('stdout');
              return [2 /*return*/];
          }
        });
      });
    });
    it('should run on the capsule directory', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults, output;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              output = '';
              execResults.stdout.on('data', function (data) {
                output += data;
              });
              execResults.stdout.on('error', function (error) {
                console.log('on error', error);
              });
              // @ts-ignore
              execResults.on('close', function () {
                // a hack for Mac, which randomly name the dir as '/private/var/folders' or '/var/folders'
                var dirResult = output.replace('/private/var/folders', '/var/folders').replace('\n', '');
                chai_1.expect(dirResult).to.equal(container.getPath());
              });
              return [2 /*return*/];
          }
        });
      });
    });
    it('should return stderr', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              chai_1.expect(execResults).to.have.property('stderr');
              return [2 /*return*/];
          }
        });
      });
    });
    it('should return stdin', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              chai_1.expect(execResults).to.have.property('stdin');
              return [2 /*return*/];
          }
        });
      });
    });
    it('should have abort method', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              chai_1.expect(execResults).to.have.property('abort');
              return [2 /*return*/];
          }
        });
      });
    });
    it('should have inspect method', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              chai_1.expect(execResults).to.have.property('inspect');
              return [2 /*return*/];
          }
        });
      });
    });
    it('inspect() should return the pid and the running status', function () {
      return __awaiter(_this, void 0, void 0, function () {
        var execResults, status;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, container.exec({ command: ['pwd'] })];
            case 1:
              execResults = _a.sent();
              return [4 /*yield*/, execResults.inspect()];
            case 2:
              status = _a.sent();
              chai_1.expect(status).to.have.property('pid');
              chai_1.expect(status).to.have.property('running');
              return [2 /*return*/];
          }
        });
      });
    });
  });
  describe('put()', function () {
    var container;
    before(function () {
      return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              mock({});
              container = new container_1.default();
              return [4 /*yield*/, container.start()];
            case 1:
              _a.sent();
              return [4 /*yield*/, container.put({ 'a.txt': 'hello' }, { path: 'foo' })];
            case 2:
              _a.sent();
              return [2 /*return*/];
          }
        });
      });
    });
    after(function () {
      mock.restore();
    });
    it('should create the file on the filesystem', function () {
      chai_1.expect(path_1.default.join(container.getPath(), 'foo', 'a.txt')).to.be.a.file();
    });
  });
  describe('get()', function () {
    var container;
    var getResults;
    before(function () {
      return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              mock({});
              container = new container_1.default();
              return [4 /*yield*/, container.start()];
            case 1:
              _a.sent();
              return [4 /*yield*/, container.put({ 'a.txt': 'hello' }, { path: 'foo' })];
            case 2:
              _a.sent();
              return [4 /*yield*/, container.get({ path: path_1.default.join('foo', 'a.txt') })];
            case 3:
              getResults = _a.sent();
              return [2 /*return*/];
          }
        });
      });
    });
    after(function () {
      mock.restore();
    });
    it('should return a stream result', function () {
      var endResult = '';
      getResults.on('data', function (chunk) {
        endResult += chunk;
      });
      getResults.on('end', function () {
        chai_1.expect(endResult).to.equal('hello');
      });
    });
  });
  describe('other container interface methods', function () {
    var container;
    before(function () {
      return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              mock({});
              container = new container_1.default();
              return [4 /*yield*/, container.start()];
            case 1:
              _a.sent();
              return [2 /*return*/];
          }
        });
      });
    });
    after(function () {
      mock.restore();
    });
    it('"inspect" method should be implemented', function () {
      chai_1.expect(container.inspect).to.not.throw();
    });
    it('"pause" method should be implemented', function () {
      chai_1.expect(container.pause).to.not.throw();
    });
    it('"resume" method should be implemented', function () {
      chai_1.expect(container.resume).to.not.throw();
    });
  });
});
//# sourceMappingURL=module.js.map

//# sourceMappingURL={"version":3,"file":"module.js","sourceRoot":"","sources":["module.tsx"],"names":[],"mappings":"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"}
