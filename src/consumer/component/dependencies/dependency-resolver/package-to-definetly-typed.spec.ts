import { expect } from 'chai';
import { packageToDefinetlyTyped } from './package-to-definetly-typed';

const scenarios = new Map([
  ['@testing-library/jest-dom', '@types/testing-library__jest-dom'],
  ['chai', '@types/chai'],
  ['mocha', '@types/mocha'],

  ['classnames', '@types/classnames'],
  ['cors', '@types/cors'],
  ['cross-spawn', '@types/cross-spawn'],
  ['dagre', '@types/dagre'],
  ['didyoumean', '@types/didyoumean'],
  ['eslint', '@types/eslint'],
  ['express', '@types/express'],
  ['find-cache-dir', '@types/find-cache-dir'],
  ['find-root', '@types/find-root'],
  ['history', '@types/history'],
  ['http-proxy-agent', '@types/http-proxy-agent'],
  ['lodash', '@types/lodash'],
  ['lodash.compact', '@types/lodash.compact'],
  ['lodash.flatten', '@types/lodash.flatten'],
  ['lodash.head', '@types/lodash.head'],
  ['lodash.pick', '@types/lodash.pick'],
  ['@mdx-js/react', '@types/mdx-js__react'],
  ['memoizee', '@types/memoizee'],
  ['mime', '@types/mime'],
  ['mousetrap', '@types/mousetrap'],
  ['node', '@types/node'],
  ['puppeteer', '@types/puppeteer'],
  ['react', '@types/react'],
  ['react-dom', '@types/react-dom'],
  ['react-router-dom', '@types/react-router-dom'],
  ['react-tabs', '@types/react-tabs'],
  ['react-tooltip', '@types/react-tooltip'],
  ['socket.io-client', '@types/socket.io-client'],
  ['ua-parser-js', '@types/ua-parser-js'],
  ['url-join', '@types/url-join'],
  ['url-parse', '@types/url-parse'],
  ['webpack', '@types/webpack'],
  ['webpack-dev-server', '@types/webpack-dev-server'],
  ['webpack-merge', '@types/webpack-merge'],
]);

describe('packageToDefinetlyTyped()', () => {
  scenarios.forEach((expected, input) => {
    it(`should map to ${expected}`, () => {
      const result = packageToDefinetlyTyped(input);

      expect(result).to.equal(expected);
    });
  });
});
