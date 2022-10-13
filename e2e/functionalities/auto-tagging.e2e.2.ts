import chai, { expect } from 'chai';
import { AUTO_TAGGED_MSG } from '../../src/api/consumer/lib/tag';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('auto tagging functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with dependencies of dependencies', () => {
    let tagOutput;
    let beforeSecondTag: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();

      helper.fs.appendFile('comp3/index.js');
      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');
      beforeSecondTag = helper.scopeHelper.cloneLocalScope();
      tagOutput = helper.command.tagWithoutBuild('comp3');
    });
    it('should auto tag the dependencies and the nested dependencies', () => {
      expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
      expect(tagOutput).to.have.string('comp1@0.0.2');
      expect(tagOutput).to.have.string('comp2@0.0.2');
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent('comp2@latest');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies[0].id.name).to.equal('comp3');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp3', version: '0.0.2' });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent('comp1@latest');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies[0].id.name).to.equal('comp2');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp3', version: '0.0.2' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp2', version: '0.0.2' });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.be.empty;
      const staged = helper.command.getStagedIdsFromStatus();
      expect(staged).to.include('comp1');
      expect(staged).to.include('comp2');
      expect(staged).to.include('comp3');
    });
    describe('with --skip-auto-tag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSecondTag);
        tagOutput = helper.command.tagWithoutBuild('comp3', '--skip-auto-tag');
      });
      it('should not auto tag the dependencies', () => {
        expect(tagOutput).to.not.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.not.have.string('comp1@0.0.2');
        expect(tagOutput).to.not.have.string('comp2@0.0.2');
      });
      it('bitmap should show the correct versions', () => {
        const bitmap = helper.bitMap.read();
        expect(bitmap.comp1.version).to.equal('0.0.1');
        expect(bitmap.comp2.version).to.equal('0.0.1');
      });
    });
  });
  // @TODO: FIX ON HARMONY!
  // this is failing for the same reason flows/cyclic-dependencies.e2e.2 are failing.
  describe.skip('with cyclic dependencies', () => {
    let scopeBeforeTag;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJson.addKeyVal('packageManager', 'yarn');
      helper.fs.createFile('bar/a', 'a.js', 'require("../b/b")');
      helper.fs.createFile('bar/b', 'b.js', 'require("../c/c")');
      helper.fs.createFile('bar/c', 'c.js', 'require("../a/a"); console.log("I am C v1")');
      helper.command.addComponent('bar/*', { n: 'bar' });
      helper.command.tagAllWithoutBuild();
      helper.fs.createFile('bar/c', 'c.js', 'require("../a/a"); console.log("I am C v2")');
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should recognize the auto tag pending components', () => {
      const output = helper.command.statusJson();
      expect(output.autoTagPendingComponents).to.deep.include('bar/a@0.0.1');
      expect(output.autoTagPendingComponents).to.deep.include('bar/b@0.0.1');
    });
    describe('tagging the components with auto-version-bump', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagAllWithoutBuild();
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('bar/a@0.0.2');
        expect(tagOutput).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', () => {
        const barA = helper.command.catComponent('bar/a@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '0.0.2' });

        const barB = helper.command.catComponent('bar/b@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component with the cycle dependency', () => {
        const barC = helper.command.catComponent('bar/c@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
    });
    describe('tagging the components with a specific version', () => {
      // see https://github.com/teambit/bit/issues/2034 for the issue this test for
      let tagOutput: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
        tagOutput = helper.command.tagAllWithoutBuild('--ver 2.0.0');
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('bar/c@2.0.0');
        expect(tagOutput).to.have.string('bar/a@0.0.2');
        expect(tagOutput).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', () => {
        const barA = helper.command.catComponent('bar/a@latest');
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '2.0.0' });

        const barB = helper.command.catComponent('bar/b@latest');
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        expect(barB.dependencies[0].id.version).to.equal('2.0.0');

        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '2.0.0' });
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component according to the specified version', () => {
        const barC = helper.command.catComponent('bar/c@latest');
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });

        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
      describe('exporting the component', () => {
        before(() => {
          helper.command.export();
        });
        it('should be successful', () => {
          const listScope = helper.command.listRemoteScopeParsed();
          expect(listScope).to.have.lengthOf(3);
        });
      });
    });
  });
  describe('with same component as direct and indirect dependent (A in: A => B => C, A => C)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fs.createFile('bar/a', 'a.js', 'require("../b/b"); require("../c/c");');
      helper.fs.createFile('bar/b', 'b.js', 'require("../c/c")');
      helper.fs.createFile('bar/c', 'c.js', 'console.log("I am C v1")');
      helper.command.addComponent('bar/*', { n: 'bar' });
      helper.command.linkAndRewire();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('"bar/*"');

      // as an intermediate step, make sure the re-link done by import C, didn't break anything
      helper.command.expectStatusToBeClean();

      helper.fs.createFile(`${helper.scopes.remote}/bar/c`, 'c.js', 'console.log("I am C v2")');
    });
    it('bit-status should show the auto-tagged pending', () => {
      const status = helper.command.statusJson();
      expect(status.autoTagPendingComponents).to.include(`${helper.scopes.remote}/bar/a@0.0.1`);
      expect(status.autoTagPendingComponents).to.include(`${helper.scopes.remote}/bar/b@0.0.1`);
    });
    describe('tagging the dependency', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagWithoutBuild('bar/c');
      });
      it('should bump the component version that is direct and indirect dependent only once', () => {
        expect(tagOutput).to.have.string('bar/a@0.0.2');

        const barA = helper.command.catComponent(`${helper.scopes.remote}/bar/a`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const barAVersions = Object.keys(barA.versions);
        expect(barAVersions).to.include('0.0.1');
        expect(barAVersions).to.include('0.0.2');
        expect(barAVersions).to.have.lengthOf(2);
      });
    });
  });
});
