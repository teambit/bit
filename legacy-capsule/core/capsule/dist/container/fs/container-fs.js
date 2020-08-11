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
Object.defineProperty(exports, '__esModule', { value: true });
var ContainerVolume = /** @class */ (function () {
  function ContainerVolume(container) {
    this.container = container;
  }
  ContainerVolume.prototype.readArchive = function (path) {
    return this.container.get({ path: path.toString() }).then(function (stream) {
      var body = '';
      stream.on('data', function (chunk) {
        body += chunk;
      });
      return new Buffer(body);
    });
  };
  ContainerVolume.prototype.putArchive = function (path, contents) {
    return __awaiter(this, void 0, Promise, function () {
      var object;
      return __generator(this, function (_a) {
        object = {};
        object[path.toString()] = contents;
        return [2 /*return*/, this.container.put(object, { path: '/capsule' })];
      });
    });
  };
  ContainerVolume.prototype.readFile = function (path, options, callback) {
    this.readArchive(path)
      .then(function (contents) {
        return callback(undefined, contents);
      })
      .catch(function (err) {
        return callback(err);
      });
  };
  ContainerVolume.prototype.writeFile = function (path, data, options, cb) {
    return __awaiter(this, void 0, Promise, function () {
      return __generator(this, function (_a) {
        return [
          2 /*return*/,
          this.putArchive(path.toString(), data).then(function () {
            if (cb) return cb();
            return;
          }),
        ];
      });
    });
  };
  ContainerVolume.fromJSON = function (container, json) {
    var volume = new ContainerVolume(container);
    if (!json) return volume;
    return volume;
  };
  return ContainerVolume;
})();
exports.default = ContainerVolume;
//# sourceMappingURL=module.js.map

//# sourceMappingURL={"version":3,"file":"module.js","sourceRoot":"","sources":["module.tsx"],"names":[],"mappings":";;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;AAGA;IACE,yBACU,SAAoB;QAApB,cAAS,GAAT,SAAS,CAAW;IAC3B,CAAC;IAEI,qCAAW,GAAnB,UAAoB,IAAc;QAChC,OAAO,IAAI,CAAC,SAAS,CAAC,GAAG,CAAC,EAAE,IAAI,EAAE,IAAI,CAAC,QAAQ,EAAE,EAAE,CAAC;aACjD,IAAI,CAAC,UAAC,MAAM;YACX,IAAI,IAAI,GAAG,EAAE,CAAC;YACd,MAAM,CAAC,EAAE,CAAC,MAAM,EAAE,UAAC,KAAK;gBACtB,IAAI,IAAI,KAAK,CAAC;YAChB,CAAC,CAAC,CAAC;YAEH,OAAO,IAAI,MAAM,CAAC,IAAI,CAAC,CAAC;QAC1B,CAAC,CAAC,CAAC;IACP,CAAC;IAEa,oCAAU,GAAxB,UAAyB,IAAc,EAAE,QAAgB;uCAAG,OAAO;;;gBAC3D,MAAM,GAA6B,EAAE,CAAC;gBAC5C,MAAM,CAAC,IAAI,CAAC,QAAQ,EAAE,CAAC,GAAG,QAAQ,CAAC;gBACnC,sBAAO,IAAI,CAAC,SAAS,CAAC,GAAG,CAAC,MAAM,EAAE,EAAE,IAAI,EAAE,UAAU,EAAE,CAAC,EAAC;;;KACzD;IAED,kCAAQ,GAAR,UAAS,IAAc,EAAE,OAA+D,EAAE,QAA8D;QACtJ,IAAI,CAAC,WAAW,CAAC,IAAI,CAAC;aACnB,IAAI,CAAC,UAAA,QAAQ,IAAI,OAAA,QAAQ,CAAC,SAAS,EAAE,QAAQ,CAAC,EAA7B,CAA6B,CAAC;aAC/C,KAAK,CAAC,UAAA,GAAG,IAAI,OAAA,QAAQ,CAAC,GAAG,CAAC,EAAb,CAAa,CAAC,CAAC;IACjC,CAAC;IAEK,mCAAS,GAAf,UAAgB,IAAuB,EAAE,IAAS,EAAE,OAAyB,EAAE,EAAa;uCAAG,OAAO;;gBACpG,sBAAO,IAAI,CAAC,UAAU,CAAC,IAAI,CAAC,QAAQ,EAAE,EAAE,IAAI,CAAC,CAAC,IAAI,CAAC;wBACjD,IAAI,EAAE;4BAAE,OAAO,EAAE,EAAE,CAAC;wBACpB,OAAO;oBACT,CAAC,CAAC,EAAC;;;KACJ;IAEM,wBAAQ,GAAf,UAAgB,SAAoB,EAAE,IAA+B;QACnE,IAAM,MAAM,GAAG,IAAI,eAAe,CAAC,SAAS,CAAC,CAAC;QAC9C,IAAI,CAAC,IAAI;YAAE,OAAO,MAAM,CAAC;QAEzB,OAAO,MAAM,CAAC;IAChB,CAAC;IACH,sBAAC;AAAD,CAAC,AA1CD,IA0CC"}
