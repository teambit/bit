"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var state_1 = require("./state");
var console_1 = require("./console");
// @ts-ignore
var unionfs_1 = require("unionfs");
var container_1 = require("./container");
var Capsule = /** @class */ (function () {
    function Capsule(container, fs, console, state) {
        this.container = container;
        this.fs = fs;
        this.console = console;
        this.state = state;
    }
    Object.defineProperty(Capsule.prototype, "containerId", {
        get: function () {
            return this.container.id;
        },
        enumerable: true,
        configurable: true
    });
    Capsule.prototype.start = function () {
        return this.container.start();
    };
    Capsule.prototype.updateFs = function (fs, fn) {
        var _this = this;
        Object.keys(fs).forEach(function (path) {
            // @ts-ignore
            _this.fs.writeFile(path, fs[path], function () {
                if (Object.keys(fs).length === 1)
                    fn();
            });
        });
    };
    Capsule.prototype.setState = function () {
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
    Capsule.prototype.exec = function (command) {
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.container.exec({
                            command: command.split(' ')
                        })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Capsule.prototype.destroy = function () {
        return this.container.destroy();
    };
    Capsule.buildFs = function (memFs, containerFs) {
        var fs = new unionfs_1.Union();
        fs
            .use(memFs)
            .use(containerFs);
        return fs;
    };
    Capsule.create = function (containerFactory, volume, initialState, console) {
        if (initialState === void 0) { initialState = new state_1["default"](); }
        if (console === void 0) { console = new console_1["default"](); }
        return __awaiter(this, void 0, void 0, function () {
            var container, fs;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, containerFactory({ image: this.image })];
                    case 1:
                        container = _a.sent();
                        return [4 /*yield*/, container_1.ContainerFS.fromJSON(container, {})];
                    case 2:
                        fs = _a.sent();
                        return [2 /*return*/, new Capsule(container, this.buildFs(volume, fs), console, initialState)];
                }
            });
        });
    };
    Capsule.image = 'ubuntu';
    return Capsule;
}());
exports["default"] = Capsule;
//# sourceMappingURL=module.js.map

//# sourceMappingURL={"version":3,"file":"module.js","sourceRoot":"","sources":["module.tsx"],"names":[],"mappings":";;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;AAAA,iCAA4B;AAI5B,qCAAgC;AAChC,aAAa;AACb,mCAAgC;AAChC,yCAA0C;AAQ1C;IACE,iBACY,SAAoB,EACrB,EAAU,EACV,OAAgB,EAChB,KAAY;QAHX,cAAS,GAAT,SAAS,CAAW;QACrB,OAAE,GAAF,EAAE,CAAQ;QACV,YAAO,GAAP,OAAO,CAAS;QAChB,UAAK,GAAL,KAAK,CAAO;IACpB,CAAC;IAIJ,sBAAI,gCAAW;aAAf;YACE,OAAO,IAAI,CAAC,SAAS,CAAC,EAAE,CAAC;QAC3B,CAAC;;;OAAA;IAED,uBAAK,GAAL;QACE,OAAO,IAAI,CAAC,SAAS,CAAC,KAAK,EAAE,CAAC;IAChC,CAAC;IAED,0BAAQ,GAAR,UAAS,EAA4B,EAAE,EAAY;QAAnD,iBAOC;QANC,MAAM,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC,OAAO,CAAC,UAAC,IAAI;YAC3B,aAAa;YACb,KAAI,CAAC,EAAE,CAAC,SAAS,CAAC,IAAI,EAAE,EAAE,CAAC,IAAI,CAAC,EAAE;gBAChC,IAAI,MAAM,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC,MAAM,KAAK,CAAC;oBAAE,EAAE,EAAE,CAAC;YACzC,CAAC,CAAC,CAAC;QACL,CAAC,CAAC,CAAC;IACL,CAAC;IAED,0BAAQ,GAAR;IAEA,CAAC;IAED,uBAAK,GAAL;QACE,OAAO,IAAI,CAAC,SAAS,CAAC,KAAK,EAAE,CAAC;IAChC,CAAC;IAED,wBAAM,GAAN;QACE,OAAO,IAAI,CAAC,SAAS,CAAC,MAAM,EAAE,CAAA;IAChC,CAAC;IAED,sBAAI,GAAJ;QACE,OAAO,IAAI,CAAC,SAAS,CAAC,IAAI,EAAE,CAAC;IAC/B,CAAC;IAED,wBAAM,GAAN;QACE,OAAO,IAAI,CAAC,SAAS,CAAC,OAAO,EAAE,CAAC;IAClC,CAAC;IAEK,sBAAI,GAAV,UAAW,OAAe;uCAAG,OAAO;;;4BAC3B,qBAAM,IAAI,CAAC,SAAS,CAAC,IAAI,CAAC;4BAC/B,OAAO,EAAE,OAAO,CAAC,KAAK,CAAC,GAAG,CAAC;yBAC5B,CAAC,EAAA;4BAFF,sBAAO,SAEL,EAAC;;;;KACJ;IAED,yBAAO,GAAP;QACE,OAAO,IAAI,CAAC,SAAS,CAAC,OAAO,EAAE,CAAC;IAClC,CAAC;IAEM,eAAO,GAAd,UAAe,KAAa,EAAE,WAAwB;QACpD,IAAM,EAAE,GAAG,IAAI,eAAK,EAAE,CAAC;QACvB,EAAE;aACC,GAAG,CAAC,KAAK,CAAC;aACV,GAAG,CAAC,WAAW,CAAC,CAAC;QAEpB,OAAO,EAAE,CAAC;IACZ,CAAC;IAEY,cAAM,GAAnB,UACI,gBAA0E,EAC1E,MAAc,EACd,YAAiC,EACjC,OAAgC;QADhC,6BAAA,EAAA,mBAA0B,kBAAK,EAAE;QACjC,wBAAA,EAAA,cAAuB,oBAAO,EAAE;;;;;4BAEhB,qBAAM,gBAAgB,CAAC,EAAE,KAAK,EAAE,IAAI,CAAC,KAAK,EAAE,CAAC,EAAA;;wBAAzD,SAAS,GAAG,SAA6C;wBACpD,qBAAM,uBAAW,CAAC,QAAQ,CAAC,SAAS,EAAE,EAAE,CAAC,EAAA;;wBAA9C,EAAE,GAAG,SAAyC;wBACpD,sBAAO,IAAI,OAAO,CAAC,SAAS,EAAE,IAAI,CAAC,OAAO,CAAC,MAAM,EAAE,EAAE,CAAC,EAAE,OAAO,EAAE,YAAY,CAAC,EAAC;;;;KAChF;IAnEM,aAAK,GAAG,QAAQ,CAAC;IAoE1B,cAAC;CAAA,AA5ED,IA4EC;qBA5EoB,OAAO"}