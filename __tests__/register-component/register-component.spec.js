import mockFs from 'mock-fs';
import * as componentResolverMock from 'bit-scope-client/component-resolver';
import BitJsonMock from 'bit-scope-client/bit-json';
import registerComponent from '../../src/register-component';

jest.mock('bit-scope-client/bit-json');
jest.mock('bit-scope-client/component-resolver');
jest.mock('console');

const bitJsonFixture = { compiler: 'bit.envs/compilers/babel::2', impl: 'impl.js' };
const implementationCodeFixture = 'export function foo() {}';
const compiledCodeFixture = 'module.exports = function foo() { return \'bar\'; }';

let consoleErrorMock;
beforeEach(() => {
  consoleErrorMock = jest.fn(() => '');
  console.error = consoleErrorMock;
  BitJsonMock.load = jest.fn(() => (bitJsonFixture));
});

afterEach(() => {
  mockFs.restore();
  componentResolverMock.default.mockClear();
  BitJsonMock.load.mockClear();
  console.error.mockClear();
});


describe('registerComponent', () => {
  it('should require the compiled implementation', () => {
    mockFs({
      '/my/path/inline_components/global/is-string': {
        'impl.js': implementationCodeFixture,
        dist: {
          'impl.js': '',
        },
      },
      '/my/path/components/compilers/babel/bit.envs/2': {
        'impl.js': `module.exports = { compile: () => { return { code: "${compiledCodeFixture}" }; } }`,
      },
    });
    componentResolverMock.default = jest.fn(() => '/my/path/components/compilers/babel/bit.envs/2/impl.js');
    const foo = registerComponent('/my/path/inline_components/global/is-string', '/my/path/inline_components/global/is-string/dist/impl.js');
    expect(typeof foo).toBe('function');
    expect(foo()).toBe('bar');
  });

  it('should work also when the dist folder is not there (component have never built)', () => {
    mockFs({
      '/my/path/inline_components/global/is-string': {
        'impl.js': implementationCodeFixture,
      },
      '/my/path/components/compilers/babel/bit.envs/2': {
        'impl.js': `module.exports = { compile: () => { return { code: "${compiledCodeFixture}" }; } }`,
      },
    });
    componentResolverMock.default = jest.fn(() => '/my/path/components/compilers/babel/bit.envs/2/impl.js');
    const foo = registerComponent('/my/path/inline_components/global/is-string', '/my/path/inline_components/global/is-string/dist/impl.js');
    expect(typeof foo).toBe('function');
    expect(foo()).toBe('bar');
  });

  it('should console error with the component path when there are not component files', () => {
    mockFs({ });
    const foo = registerComponent('/my/path/inline_components/global/is-string', '/my/path/inline_components/global/is-string/dist/impl.js');
    expect(consoleErrorMock.mock.calls[0][0].includes('/my/path/inline_components/global/is-string')).toBeTruthy();
    expect(foo).toBeNull();
  });

  it('should console error with the compiler-id when the compiler was not found', () => {
    mockFs({
      '/my/path/inline_components/global/is-string': {
        'impl.js': implementationCodeFixture,
      },
    });
    componentResolverMock.default = jest.fn(() => { throw new Error(); });
    const foo = registerComponent('/my/path/inline_components/global/is-string', '/my/path/inline_components/global/is-string/dist/impl.js');
    expect(consoleErrorMock.mock.calls[0][0].includes('bit.envs/compilers/babel::2')).toBeTruthy();
    expect(foo).toBeNull();
  });
});
