'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.useNavigate = void 0;
const navigation_provider_1 = require('./navigation-provider');
function useNavigate() {
  var _a;
  const nav = (0, navigation_provider_1.useNavigation)();
  return ((_a = nav.useNavigate) === null || _a === void 0 ? void 0 : _a.call(nav)) || nativeNavigator;
}
exports.useNavigate = useNavigate;
function nativeNavigator(target, { replace } = {}) {
  if (typeof window === 'undefined')
    throw new Error(
      'base-react.navigation.use-location - cannot use native navigator outside of browser. ' +
        'Inject a custom useNavigate, or use navigation after mount'
    );
  const { location, history } = window;
  if (typeof target === 'number') {
    history.go(target);
  } else if (replace) {
    location.replace(target);
  } else {
    location.assign(target);
  }
}
//# sourceMappingURL=use-navigate.js.map
