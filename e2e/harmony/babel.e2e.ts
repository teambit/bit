import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const EXTENSIONS_BASE_FOLDER = 'babel-env';

describe('compile extension', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('compile with babel', () => {
    describe('compile simple javascript component', () => {
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
            },
          },
        });
        helper.command.install();
        helper.command.compile(); // compile the new env

        helper.fs.outputFile('bar/foo.js', 'export function sayHello() { console.log("hello"); }; sayHello();');
        helper.command.addComponent('bar');
        helper.extensions.addExtensionToVariant('bar', `my-scope/${EXTENSIONS_BASE_FOLDER}`);
        helper.command.compile();
      });
      it('should generate dists and source maps on the workspace', () => {
        const dist = path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/bar/dist`);
        expect(dist).to.be.a.directory();
        expect(path.join(dist, 'foo.js')).to.be.a.file();
        expect(path.join(dist, 'foo.js.map')).to.be.a.file();
      });
      it('should be able to run the dist file', () => {
        const dist = path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/bar/dist`);
        expect(path.join(dist, 'foo.js')).to.be.a.file();
        const result = helper.command.runCmd(`node ${path.join(dist, 'foo.js')}`);
        expect(result).to.have.string('hello');
      });
      describe('compile on capsules', () => {
        before(() => {
          helper.command.build();
        });
        it('should generate the dists on the capsule', () => {
          const capsule = helper.command.getCapsuleOfComponent('bar');
          expect(path.join(capsule, 'dist')).to.be.a.directory();
          expect(path.join(capsule, 'dist/foo.js')).to.be.a.file();
        });
      });
    });
  });
});
