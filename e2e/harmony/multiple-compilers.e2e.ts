import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

const EXTENSIONS_BASE_FOLDER = 'multiple-compilers-env';

describe('multiple compilers - babel and typescript', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('compile with babel and ts', () => {
    describe('compile simple ts component', () => {
      let distDir;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.addDefaultScope();
        helper.bitJsonc.disablePreview();

        // add a new env that compiles with Babel
        helper.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
        helper.command.addComponent(EXTENSIONS_BASE_FOLDER);
        helper.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.bit/aspect');
        helper.scopeHelper.linkBitBin();
        helper.command.link();
        helper.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.bit/dependency-resolver', {
          policy: {
            dependencies: {
              '@babel/core': '7.11.6',
              '@babel/preset-env': '7.11.5',
              '@babel/preset-typescript': '7.10.4',
              '@babel/plugin-proposal-class-properties': '7.10.4',
            },
          },
        });
        helper.command.install();
        helper.command.compile(); // compile the new env

        helper.fs.outputFile(
          'bar/foo.ts',
          // eslint-disable-next-line no-template-curly-in-string
          'export function sayHello(name: string) { console.log(`hello ${name}`); }; sayHello("David");'
        );
        helper.command.addComponent('bar');
        helper.extensions.addExtensionToVariant('bar', `my-scope/${EXTENSIONS_BASE_FOLDER}`);
        helper.command.compile();
        distDir = path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/bar/dist`);
      });
      it('should generate dists on the workspace', () => {
        expect(distDir).to.be.a.directory();
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
      });
      it('should be able to run the dist file', () => {
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
        const result = helper.command.runCmd(`node ${path.join(distDir, 'foo.js')}`);
        expect(result).to.have.string('hello');
      });
      describe('compile on capsules', () => {
        let capsulePath;
        before(() => {
          helper.command.build();
          capsulePath = helper.command.getCapsuleOfComponent('bar');
        });
        it('should generate the dists on the capsule via babel compiler', () => {
          expect(path.join(capsulePath, 'dist')).to.be.a.directory();
          expect(path.join(capsulePath, 'dist/foo.js')).to.be.a.file();
        });
        it('should generate the d.ts on the capsule via typescript compiler', () => {
          expect(path.join(capsulePath, 'dist/foo.d.ts')).to.be.a.file();
        });
      });
    });
  });
});
