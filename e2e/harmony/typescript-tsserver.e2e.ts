import { loadBit } from '@teambit/bit';
import { TsserverClient } from '@teambit/ts-server';
import { TypescriptAspect, TypescriptMain } from '@teambit/typescript';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('TsServer component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('tsserver', () => {
    let tsServer: TsserverClient;
    before(async () => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponentsTS(1);
      helper.fs.outputFile(
        'comp1/index.ts',
        `function sayHello() {
  return 'hello';
}

const hi = sayHello();`
      );
      helper.fs.outputFile('tsconfig.json', JSON.stringify(getBasicTsconfig(), undefined, 4));
      const harmony = await loadBit(helper.scopes.localPath);
      const tsAspect = harmony.get<TypescriptMain>(TypescriptAspect.id);
      tsServer = await tsAspect.initTsserverClientFromWorkspace();
    });
    after(() => {
      tsServer.killTsServer();
    });
    it('should provide an API for quickInfo', async () => {
      const info = await tsServer.getQuickInfo('comp1/index.ts', { line: 5, character: 7 });
      expect(info?.body?.displayString).to.equal('const hi: string');
    });
    it('should provide an API for TypeDefinition', async () => {
      const def = await tsServer.getTypeDefinition('comp1/index.ts', { line: 1, character: 7 });
      expect(def?.body?.[0]).to.have.property('contextStart');
    });
    it('should provide an API for References', async () => {
      const ref = await tsServer.getReferences('comp1/index.ts', { line: 1, character: 11 });
      expect(ref?.body?.symbolName).to.equal('sayHello');
      expect(ref?.body?.refs).to.have.lengthOf(2);
      expect(ref?.body?.refs[0].lineText).to.equal('function sayHello() {');
      expect(ref?.body?.refs[1].lineText).to.equal('const hi = sayHello();');
    });
  });
});

function getBasicTsconfig() {
  return {
    compilerOptions: {
      lib: ['es2019', 'DOM', 'ES6', 'DOM.Iterable', 'ScriptHost'],
      target: 'es2015',
      module: 'commonjs',
      jsx: 'react',
      composite: true,
      declaration: true,
      sourceMap: true,
      skipLibCheck: true,
      outDir: 'dist',
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      strictPropertyInitialization: false,
      strict: true,
      moduleResolution: 'node',
      noImplicitAny: false,
      rootDir: '.',
      removeComments: true,
      preserveConstEnums: true,
      resolveJsonModule: true,
    },
    exclude: ['dist'],
  };
}
