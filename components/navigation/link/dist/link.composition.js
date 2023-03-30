'use strict';
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
exports.MultipleRoutingSystems = exports.ActiveLink = exports.ExternalLink = exports.BasicLink = void 0;
const react_1 = __importDefault(require('react'));
const navigation_provider_1 = require('./navigation-provider');
const link_1 = require('./link');
const BasicLink = () => react_1.default.createElement(link_1.Link, { href: 'https://bit.dev' }, 'bit.dev');
exports.BasicLink = BasicLink;
const ExternalLink = () =>
  react_1.default.createElement(
    'div',
    null,
    'This link will be external: (ie, it will open in a new tab)',
    react_1.default.createElement(
      'div',
      null,
      react_1.default.createElement(link_1.Link, { href: 'https://bit.dev', external: true }, 'bit.dev')
    )
  );
exports.ExternalLink = ExternalLink;
const ActiveLink = () =>
  react_1.default.createElement(
    'div',
    { style: { padding: 20 } },
    react_1.default.createElement(
      'div',
      null,
      'current url:',
      react_1.default.createElement(
        'div',
        { style: { textDecoration: 'underline' } },
        typeof window !== 'undefined' && window.location.pathname
      ),
      '(active links should be orange)'
    ),
    react_1.default.createElement('br', null),
    react_1.default.createElement(
      'div',
      null,
      'local link:',
      ' ',
      react_1.default.createElement(
        link_1.Link,
        { href: '/preview/teambit.react/react', activeStyle: { color: 'darkorange' } },
        '/preview/teambit.react/react'
      )
    ),
    react_1.default.createElement(
      'div',
      null,
      'base-react scope link',
      ' ',
      react_1.default.createElement(
        link_1.Link,
        { href: '/api/teambit.base-react', activeStyle: { color: 'darkorange' } },
        '/api/teambit.base-react'
      )
    ),
    react_1.default.createElement(
      'div',
      null,
      'another link:',
      react_1.default.createElement(
        link_1.Link,
        { href: 'inactive/link', activeStyle: { color: 'darkorange' } },
        'inactive/link'
      )
    )
  );
exports.ActiveLink = ActiveLink;
const navA = {
  Link: function _Link(_a) {
    var { children } = _a,
      props = __rest(_a, ['children']);
    return react_1.default.createElement('a', Object.assign({}, props, { role: 'img' }), children, ' \uD83D\uDD17');
  },
};
const navB = {
  Link: function _Link(_a) {
    var { style } = _a,
      props = __rest(_a, ['style']);
    return react_1.default.createElement(
      'a',
      Object.assign({}, props, { style: Object.assign({ textDecoration: 'none', fontWeight: 'bolder' }, style) }),
      props.children
    );
  },
};
const MultipleRoutingSystems = () =>
  react_1.default.createElement(
    'div',
    null,
    react_1.default.createElement(
      navigation_provider_1.NavigationProvider,
      { implementation: navA },
      react_1.default.createElement('span', null, 'System 1'),
      ' ',
      react_1.default.createElement(link_1.Link, { href: 'https://bit.dev' }, 'Link')
    ),
    react_1.default.createElement('br', null),
    react_1.default.createElement(
      navigation_provider_1.NavigationProvider,
      { implementation: navB },
      react_1.default.createElement('span', null, 'System 2'),
      ' ',
      react_1.default.createElement(link_1.Link, { href: 'https://bit.dev' }, 'Link')
    ),
    react_1.default.createElement('br', null),
    react_1.default.createElement('br', null),
    'Default ',
    react_1.default.createElement(link_1.Link, { href: 'https://bit.cloud' }, 'Link')
  );
exports.MultipleRoutingSystems = MultipleRoutingSystems;
//# sourceMappingURL=link.composition.js.map
