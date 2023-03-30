'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const react_1 = __importDefault(require('react'));
const react_2 = require('@testing-library/react');
require('@testing-library/jest-dom');
const link_composition_1 = require('./link.composition');
const link_1 = require('./link');
describe('native html link', () => {
  it('should render', () => {
    const { getByText } = (0, react_2.render)(react_1.default.createElement(link_composition_1.BasicLink, null));
    const rendered = getByText('bit.dev');
    expect(rendered).toBeInstanceOf(HTMLElement);
  });
  it('should link to target', () => {
    const { getByText } = (0, react_2.render)(react_1.default.createElement(link_composition_1.BasicLink, null));
    const rendered = getByText('bit.dev');
    expect(rendered.tagName).toEqual('A');
    expect(rendered).toHaveProperty('href', 'https://bit.dev/');
  });
  it('should open in new tab/window, when external=true', () => {
    const { getByText } = (0, react_2.render)(react_1.default.createElement(link_composition_1.ExternalLink, null));
    const rendered = getByText('bit.dev');
    expect(rendered).toHaveProperty('target', '_blank');
    // security - rel='noopener' prevents the opened page to gain any kind of access to the original page.
    expect(rendered).toHaveProperty('rel', 'noopener');
  });
  it('should pass active styles when explicitly active', () => {
    const { getByText } = (0, react_2.render)(
      react_1.default.createElement(
        link_1.Link,
        { href: '/', activeClassName: 'active', activeStyle: { fontWeight: 'bold' }, active: true },
        'click here'
      )
    );
    const rendered = getByText('click here');
    expect(rendered).toHaveClass('active');
    expect(rendered).toHaveStyle({ fontWeight: 'bold' });
  });
  it('should not pass active styles when explicitly not active', () => {
    const { getByText } = (0, react_2.render)(
      react_1.default.createElement(
        link_1.Link,
        { href: '/', activeClassName: 'active', activeStyle: { fontWeight: 'bold' }, active: false },
        'click here'
      )
    );
    const rendered = getByText('click here');
    expect(rendered).not.toHaveClass('active');
    expect(rendered).not.toHaveStyle({ fontWeight: 'bold' });
  });
  it('should automatically pass active style when matching location', () => {
    const { getByText } = (0, react_2.render)(
      react_1.default.createElement(
        link_1.Link,
        { href: '/', activeClassName: 'active', activeStyle: { fontWeight: 'bold' } },
        'click here'
      )
    );
    const rendered = getByText('click here');
    expect(rendered).toHaveClass('active');
    expect(rendered).toHaveStyle({ fontWeight: 'bold' });
  });
  it('should automatically skip active style when not matching location', () => {
    const { getByText } = (0, react_2.render)(
      react_1.default.createElement(
        link_1.Link,
        { href: '/other-path', activeClassName: 'active', activeStyle: { fontWeight: 'bold' } },
        'click here'
      )
    );
    const rendered = getByText('click here');
    expect(rendered).not.toHaveClass('active');
    expect(rendered).not.toHaveStyle({ fontWeight: 'bold' });
  });
});
//# sourceMappingURL=link.spec.js.map
