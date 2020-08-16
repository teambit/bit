'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
var stream_1 = require('stream');
var Console = /** @class */ (function () {
  function Console(stdout) {
    if (stdout === void 0) {
      stdout = new stream_1.Duplex();
    }
    this.stdout = stdout;
  }
  Console.prototype.getStdout = function () {
    return this.stdout;
  };
  Console.prototype.on = function () {};
  return Console;
})();
exports.default = Console;
//# sourceMappingURL=module.js.map

//# sourceMappingURL={"version":3,"file":"module.js","sourceRoot":"","sources":["module.tsx"],"names":[],"mappings":";;AAAA,iCAAgC;AAEhC;IACE,iBACU,MAA4C;QAA5C,uBAAA,EAAA,aAAoC,eAAM,EAAE;QAA5C,WAAM,GAAN,MAAM,CAAsC;IAEnD,CAAC;IAEJ,2BAAS,GAAT;QACE,OAAO,IAAI,CAAC,MAAM,CAAC;IACrB,CAAC;IAED,oBAAE,GAAF;IAEA,CAAC;IACH,cAAC;AAAD,CAAC,AAbD,IAaC"}
