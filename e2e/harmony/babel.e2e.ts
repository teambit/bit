import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

const EXTENSIONS_BASE_FOLDER = 'babel-env';

describe('babel compiler', function () {
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
      let distDir;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.addDefaultScope();
        helper.bitJsonc.disablePreview();

        // add a new env that compiles with Babel
        helper.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
        helper.command.addComponent(EXTENSIONS_BASE_FOLDER);
        helper.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.harmony/aspect');
        helper.scopeHelper.linkBitLegacy();
        helper.command.link();
        helper.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.dependencies/dependency-resolver', {
          policy: {
            dependencies: {
              '@babel/runtime': '^7.12.0',
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
        distDir = path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/bar/dist`);
      });
      it('should generate dists on the workspace', () => {
        expect(distDir).to.be.a.directory();
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
      });
      it('should generate source maps on the workspace', () => {
        expect(path.join(distDir, 'foo.js.map')).to.be.a.file();
      });
      it('should generate source maps correctly with the paths to the sources', () => {
        const mapFile = path.join(distDir, 'foo.js.map');
        const mapFileParsed = fs.readJSONSync(mapFile);
        expect(mapFileParsed).to.have.property('sourceRoot');
        expect(mapFileParsed.sourceRoot).to.endsWith(`${path.sep}bar`);
        expect(mapFileParsed).to.have.property('sources');
      });
      it('should be able to run the dist file', () => {
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
        const result = helper.command.runCmd(`node ${path.join(distDir, 'foo.js')}`);
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
