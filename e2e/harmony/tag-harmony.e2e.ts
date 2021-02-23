import chai, { expect } from 'chai';
import chalk from 'chalk';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { Extensions } from '../../src/constants';
import { SchemaName } from '../../src/consumer/component/component-schema';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('tag components on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with standard components', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');
    });
    it('should import successfully with the schema prop', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1).to.have.property('schema');
      expect(comp1.schema).to.equal(SchemaName.Harmony);
    });
    it('bit status should work and not show modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
    });
    describe('tag without build after full tag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('-s 1.0.0');
      });
      it('should not save the builder data from the previous version', () => {
        const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
        const builder = helper.general.getExtension(comp, Extensions.builder);
        expect(builder.data).to.not.have.property('pipeline');
        expect(builder.data).to.not.have.property('artifacts');
      });
      it('should be able to export successfully', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
  });
  describe('tag on Harmony', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.tagScope('0.0.2');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
    });
    // this happens as a result of package.json in the node_modules for author point to the wrong
    // version. currently, the version is removed.
    it('should not show the dependency with an older version', () => {
      const show = helper.command.showComponentParsed('comp1');
      expect(show.dependencies[0].id).to.equal(`${helper.scopes.remote}/comp2@0.0.2`);
    });
    describe('auto-tag', () => {
      before(() => {
        helper.fs.appendFile('comp2/index.js');
      });
      it('should save the artifacts/dists to the auto-tagged components', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const builderExt = comp1.extensions.find((e) => e.name === Extensions.builder);
        expect(builderExt.data).to.have.property('artifacts');
        const compilerArtifacts = builderExt.data.artifacts.find((a) => a.task.id === Extensions.compiler);
        expect(compilerArtifacts.files.length).to.be.greaterThan(0);
      });
    });
  });
  describe('soft tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.softTag('--all');
    });
    it('should add a property of nextVersion in .bitmap file', () => {
      const bitMap = helper.bitMap.readComponentsMapOnly();
      const componentsMap: any = Object.values(bitMap);
      componentsMap.forEach((componentMap) => {
        expect(componentMap).to.have.property('nextVersion');
        expect(componentMap.nextVersion.version).to.equal('patch');
      });
    });
    it('bit status should show the new components as soft tagged', () => {
      const status = helper.command.status();
      expect(chalk.reset(status)).to.have.string('comp1 ... ok (soft-tagged)');
    });
    describe('tagging with --persist flag', () => {
      before(() => {
        helper.command.persistTag();
      });
      it('should tag and remove the nextVersion property in .bitmap file', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        const componentsMap = Object.values(bitMap);
        componentsMap.forEach((componentMap) => {
          expect(componentMap).to.not.have.property('nextVersion');
        });
        const ids = Object.keys(bitMap);
        ids.forEach((id) => expect(id).to.include('0.0.1'));
      });
      it('bit status should not show as soft-tagged', () => {
        const status = helper.command.status();
        expect(chalk.reset(status)).to.not.have.string('soft-tagged');
      });
      describe('modify a component that has dependents and soft-tag it', () => {
        before(() => {
          helper.fs.appendFile('comp3/index.js');
          helper.command.softTag('comp3');
        });
        it('should save the nextVersion data into potential auto-tag bitmap entries', () => {
          const bitMap = helper.bitMap.readComponentsMapOnly();
          expect(bitMap['comp2@0.0.1']).to.have.property('nextVersion');
          expect(bitMap['comp1@0.0.1']).to.have.property('nextVersion');
        });
      });
    });
    describe('soft tag with specific version and message', () => {
      before(() => {
        helper.command.softTag('-a -s 2.0.0 -m "my custom message"');
      });
      it('should save the version and the message into the .bitmap file', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        const componentsMap: any[] = Object.values(bitMap);
        componentsMap.forEach((componentMap) => {
          expect(componentMap).to.have.property('nextVersion');
          expect(componentMap.nextVersion.version).to.equal('2.0.0');
          expect(componentMap.nextVersion.message).to.match(/bump dependencies versions|my custom message/);
        });
      });
    });
    describe('soft tag after soft tag', () => {
      let tagOutput;
      before(() => {
        helper.command.softTag('-a -s 2.0.0');
        tagOutput = helper.command.softTag('-a -s 3.0.0');
      });
      it('should show the output according to the new soft-tag', () => {
        expect(tagOutput).to.have.string('3.0.0');
        expect(tagOutput).to.not.have.string('2.0.0');
      });
      it('should save the version and the message into the .bitmap file', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        const componentsMap: any[] = Object.values(bitMap);
        componentsMap.forEach((componentMap) => {
          expect(componentMap.nextVersion.version).to.equal('3.0.0');
        });
      });
    });
    describe('untag', () => {
      before(() => {
        helper.command.softTag('-a -s 3.0.0');
        helper.command.untagSoft('--all');
      });
      it('should remove the nextVersion from the .bitmap file', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        const componentsMap: any[] = Object.values(bitMap);
        componentsMap.forEach((componentMap) => {
          expect(componentMap).to.not.have.property('nextVersion');
        });
      });
    });
  });
  describe('tag scope', () => {
    let beforeTagScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3 0.0.3');
      helper.command.tagWithoutBuild('comp2 0.0.2');
      helper.command.tagWithoutBuild('comp1 0.0.1');
      beforeTagScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('without version', () => {
      let output;
      before(() => {
        output = helper.command.tagScopeWithoutBuild();
      });
      it('should bump each component by patch', () => {
        expect(output).to.have.string('comp1@0.0.2');
        expect(output).to.have.string('comp2@0.0.3');
        expect(output).to.have.string('comp3@0.0.4');
      });
    });
    describe('without version and --minor flag', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeTagScope);
        output = helper.command.tagScopeWithoutBuild('', '--minor');
      });
      it('should bump each component by patch', () => {
        expect(output).to.have.string('comp1@0.1.0');
        expect(output).to.have.string('comp2@0.1.0');
        expect(output).to.have.string('comp3@0.1.0');
      });
    });
  });
});
