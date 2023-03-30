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
var __rest =
  (this && this.__rest) ||
  function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === 'function')
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
      }
    return t;
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.NativeLink = void 0;
const react_1 = __importStar(require('react'));
const classnames_1 = __importDefault(require('classnames'));
const base_ui_routing_compare_url_1 = require('@teambit/base-ui.routing.compare-url');
const use_location_1 = require('./use-location');
const externalLinkAttributes = { rel: 'noopener', target: '_blank' };
exports.NativeLink = (0, react_1.forwardRef)(function NativeLink(_a, ref) {
  var {
      className,
      style,
      activeClassName,
      activeStyle,
      active,
      strict,
      exact,
      href,
      external,
      // unused, but excluded from ...rest:
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      native,
      // unused, but excluded from ...rest:
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      state,
    } = _a,
    rest = __rest(_a, [
      'className',
      'style',
      'activeClassName',
      'activeStyle',
      'active',
      'strict',
      'exact',
      'href',
      'external',
      'native',
      'state',
    ]);
  const location = (0, use_location_1.useLocation)();
  // skip url compare when is irrelevant
  const shouldCalcActive = !!activeClassName || !!activeStyle;
  const isActive = (0, react_1.useMemo)(() => {
    if (!shouldCalcActive) return false;
    if (typeof active === 'boolean') return active;
    if (!location || !href) return false;
    return (0, base_ui_routing_compare_url_1.compareUrl)(location.pathname, href, { exact, strict });
  }, [active, href, location, shouldCalcActive]);
  const externalProps = external ? externalLinkAttributes : {};
  const combinedStyles = (0, react_1.useMemo)(
    () => (isActive && activeStyle ? Object.assign(Object.assign({}, style), activeStyle) : style),
    [isActive, style]
  );
  return react_1.default.createElement(
    'a',
    Object.assign({}, externalProps, rest, {
      ref: ref,
      href: href,
      className: (0, classnames_1.default)(className, isActive && activeClassName),
      style: combinedStyles,
    })
  );
});
//# sourceMappingURL=native-link.js.map
