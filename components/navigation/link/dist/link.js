'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.Link = void 0;
const react_1 = __importStar(require('react'));
const navigation_provider_1 = require('./navigation-provider');
const native_link_1 = require('./native-link');
/** implementation agnostic Link component, basic on the standard `a` tag */
exports.Link = (0, react_1.forwardRef)(function Link(props, ref) {
  const nav = (0, navigation_provider_1.useNavigation)();
  const ActualLink = nav.Link || native_link_1.NativeLink;
  if (props.native || props.external) {
    return react_1.default.createElement(native_link_1.NativeLink, Object.assign({}, props, { ref: ref }));
  }
  return react_1.default.createElement(ActualLink, Object.assign({}, props, { ref: ref }));
});
//# sourceMappingURL=link.js.map
