import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { Extensions } from '../../src/constants';

chai.use(require('chai-fs'));

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
  describe('workspace with a new compile extension', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let scopeBeforeTag: string;
    let appOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      helper.extensions.addExtensionToVariant('*', '@teambit/react', {});
      appOutput = helper.fixtures.populateComponentsTS(3, undefined, true);
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    describe('compile from the cmd (compilation for development)', () => {
      before(() => {
        helper.command.runCmd('bit compile');
      });
      it('should not create a capsule as it is not needed for development', () => {
        const capsulesJson = helper.command.runCmd('bit capsule-list -j');
        const capsules = JSON.parse(capsulesJson);
        capsules.capsules.forEach((c) => expect(c).to.not.have.string('comp1'));
      });
      it('should write the dists files inside the node-modules of the component', () => {
        const nmComponent = path.join(
          helper.scopes.localPath,
          'node_modules',
          `@${helper.scopes.remote}`,
          'comp1',
          'dist'
        );
        expect(nmComponent).to.be.a.directory();
        expect(path.join(nmComponent, 'index.js')).to.be.a.file();
        expect(path.join(nmComponent, 'index.js.map')).to.be.a.file(); // should save source-map.
      });
      it('the app should work', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result).to.have.string(appOutput);
      });
    });
    describe('tag the components (compilation for release)', () => {
      before(() => {
        helper.command.tagAllComponents();
      });
      it('should write dists files inside the capsule as it is needed for release', () => {
        const capsule = helper.command.getCapsuleOfComponent('comp1');
        expect(path.join(capsule, 'dist')).to.be.a.directory();
        expect(path.join(capsule, 'dist/index.js')).to.be.a.file();
      });
      it('should save the dists in the objects', () => {
        const catComp2 = helper.command.catComponent('comp2@latest');
        expect(catComp2).to.have.property('extensions');
        const compileExt = catComp2.extensions.find((e) => e.name === Extensions.compiler);
        const files = compileExt.artifacts.map((d) => d.relativePath);
        expect(files).to.include('dist/index.js');
        expect(files).to.include('dist/index.d.ts'); // makes sure it saves declaration files
      });
      describe('export and import to another scope', () => {
        before(() => {
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('comp1');
        });
        it('should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        it('should save the artifacts and package.json on node_modules', () => {
          const artifactsPath = path.join(helper.scopes.localPath, 'node_modules', `@${helper.scopes.remote}`, 'comp1');
          expect(path.join(artifactsPath, 'dist/index.js')).to.be.a.file();
          expect(path.join(artifactsPath, 'package.json')).to.be.a.file();
        });
        it('should save the artifacts and package.json for NESTED in the component dir, same as legacy', () => {
          const nestedPath = path.join(
            helper.scopes.localPath,
            'components/.dependencies/comp2',
            helper.scopes.remote,
            '0.0.1'
          );
          expect(path.join(nestedPath, 'dist/index.js')).to.be.a.file();
          expect(path.join(nestedPath, 'package.json')).to.be.a.file();
        });
        describe('running compile on the imported component', () => {
          it('should generate dists also after deleting the dists from the workspace', () => {
            const distPath = path.join(
              helper.scopes.localPath,
              'node_modules',
              `@${helper.scopes.remote}`,
              'comp1',
              'dist'
            );
            fs.removeSync(distPath);
            helper.command.runCmd('bit compile');
            expect(distPath).to.be.a.directory();
            expect(path.join(distPath, 'index.js')).to.be.a.file();
          });
        });
      });
    });
    describe('add another component that does not need any compilation', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
        helper.fs.outputFile('bar/foo.js');
        helper.command.addComponent('bar');
        helper.bitJsonc.setVariant(undefined, 'bar', {});
        helper.bitJsonc.addToVariant(helper.scopes.localPath, 'bar', 'propagate', false);
        output = helper.command.tagAllComponents();
      });
      // a guard for Flows bug that exits unexpectedly
      it('should be able to tag', () => {
        expect(output).to.have.string('4 component(s) tagged');
      });
      it('should still save the dists on the component with the compiler', () => {
        const catComp = helper.command.catComponent('comp3@latest');
        expect(catComp).to.have.property('extensions');
        const compileExt = catComp.extensions.find((e) => e.name === Extensions.compiler);
        const files = compileExt.artifacts.map((d) => d.relativePath);
        expect(files).to.include('dist/index.js');
      });
    });
  });
  describe('component with unsupported compiler files', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      helper.extensions.addExtensionToVariant('*', '@teambit/react', {});
      helper.fixtures.populateComponentsTS(1, undefined, true);
      helper.fs.outputFile('comp1/style.css', 'h1{}');
      helper.fs.outputFile('comp1/types.d.ts', 'export const myField: number');
      helper.command.runCmd('bit compile');
    });
    it('should copy non-supported files to the dists', () => {
      const nmComponent = path.join(
        helper.scopes.localPath,
        'node_modules',
        `@${helper.scopes.remote}`,
        'comp1',
        'dist'
      );
      expect(nmComponent).to.be.a.directory();
      expect(path.join(nmComponent, 'index.js')).to.be.a.file();
      expect(path.join(nmComponent, 'style.css')).to.be.a.file();
      expect(path.join(nmComponent, 'types.d.ts')).to.be.a.file();

      const styleContent = fs.readFileSync(path.join(nmComponent, 'style.css'));
      expect(styleContent.toString()).to.be.equal('h1{}');
    });
    describe('tag the components', () => {
      before(() => {
        helper.command.tagAllComponents();
      });
      it('should copy unsupported files inside the capsule', () => {
        const capsule = helper.command.getCapsuleOfComponent('comp1');
        expect(path.join(capsule, 'dist')).to.be.a.directory();
        expect(path.join(capsule, 'dist/style.css')).to.be.a.file();
      });
    });
  });
});
