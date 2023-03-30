'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.useLocation = void 0;
const navigation_provider_1 = require('./navigation-provider');
function useLocation() {
  const nav = (0, navigation_provider_1.useNavigation)();
  const actualUseLocation = nav.useLocation || NativeUseLocation;
  return actualUseLocation();
}
exports.useLocation = useLocation;
function NativeUseLocation() {
  if (typeof window === 'undefined') return undefined;
  return window.location;
}
//# sourceMappingURL=use-location.js.map
