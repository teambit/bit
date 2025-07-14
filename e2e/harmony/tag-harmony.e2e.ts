import chai, { expect } from 'chai';
import chalk from 'chalk';
import path from 'path';
import { uniq } from 'lodash';
import { Extensions } from '@teambit/legacy.constants';
import { SchemaName } from '@teambit/legacy.consumer-component';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('tag components on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with standard components', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('*');
    });
    it('should import successfully with the schema prop', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1).to.have.property('schema');
      expect(comp1.schema).to.equal(SchemaName.Harmony2);
    });
    it('bit status should work and not show modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.be.empty;
    });
    describe('tag without build after full tag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('--ver 1.0.0 --unmodified');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.command.tagIncludeUnmodified('0.0.2');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.be.empty;
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.softTag();
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
        ids.forEach((id) => expect(bitMap[id].version).to.equal('0.0.1'));
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
          expect(bitMap.comp2).to.have.property('nextVersion');
          expect(bitMap.comp1).to.have.property('nextVersion');
        });
      });
    });
    describe('soft tag with specific version and message', () => {
      before(() => {
        helper.command.softTag('--ver 2.0.0 --unmodified -m "my custom message"');
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
    describe('soft tag with specific version attached to a component-id', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(1);
        helper.command.softTag('comp1@0.0.5');
      });
      it('should save the version into the .bitmap file', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        const componentMap = bitMap.comp1;
        expect(componentMap).to.have.property('nextVersion');
        expect(componentMap.nextVersion.version).to.equal('0.0.5');
      });
    });
    describe('soft tag after soft tag', () => {
      let tagOutput;
      before(() => {
        helper.command.softTag('--ver 2.0.0');
        tagOutput = helper.command.softTag('--ver 3.0.0');
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
        helper.command.softTag('--ver 3.0.0');
        helper.command.resetSoft('--all');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3@0.0.3');
      helper.command.tagWithoutBuild('comp2@0.0.2');
      helper.command.tagWithoutBuild('comp1@0.0.1');
      beforeTagScope = helper.scopeHelper.cloneWorkspace();
    });
    describe('without version', () => {
      let output;
      before(() => {
        output = helper.command.tagIncludeUnmodifiedWithoutBuild();
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
        helper.scopeHelper.getClonedWorkspace(beforeTagScope);
        output = helper.command.tagIncludeUnmodifiedWithoutBuild('', '--minor');
      });
      it('should bump each component by patch', () => {
        expect(output).to.have.string('comp1@0.1.0');
        expect(output).to.have.string('comp2@0.1.0');
        expect(output).to.have.string('comp3@0.1.0');
      });
    });
  });
  describe('with failing tests', () => {
    let beforeTagScope: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('bar/index.js');
      helper.fs.outputFile(
        'bar/foo.spec.js',
        `
        describe('bar component', () => {
          it('should fail', () => {
            expect(true).toBe(false);
          });
        });
      `
      );
      helper.command.addComponent('bar');
      beforeTagScope = helper.scopeHelper.cloneWorkspace();
    });
    it('should fail without --skip-tests', () => {
      const cmd = () => helper.command.tagAllComponents();
      const error = new Error('Failed task 1: "teambit.defender/tester:JestTest" of env "teambit.harmony/node"');
      helper.general.expectToThrow(cmd, error);
      const stagedConfigPath = helper.general.getStagedConfigPath();
      expect(stagedConfigPath).to.not.be.a.path();
    });
    it('should succeed with --skip-tests', () => {
      helper.scopeHelper.getClonedWorkspace(beforeTagScope);
      expect(() => helper.command.tagAllComponents('--skip-tests')).to.not.throw();
    });
    it('should succeed with --ignore-build-errors', () => {
      helper.scopeHelper.getClonedWorkspace(beforeTagScope);
      expect(() => helper.command.tagAllComponents('--ignore-build-errors')).to.not.throw();
    });
    it('should not throw with --build --loose when only test failures occur and set buildStatus to succeed', () => {
      helper.scopeHelper.getClonedWorkspace(beforeTagScope);
      helper.command.tagAllComponents('--build --loose');
      const comp = helper.command.catComponent('bar@latest');
      expect(comp.buildStatus).to.equal('succeed');
    });
  });
  describe('modified one component, the rest are auto-tag pending', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      // modify only comp3. so then comp1 and comp2 are auto-tag pending
      helper.fs.appendFile('comp3/index.js');
    });
    describe('tag with specific version', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('--ver 1.0.0');
      });
      it('should set the specified version to the modified component and bumped by patch the auto-tagged', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp3.version).to.equal('1.0.0');
        expect(bitMap.comp1.version).to.equal('0.0.2');
        expect(bitMap.comp2.version).to.equal('0.0.2');
      });
    });
    describe('tag with --scope flag', () => {
      before(() => {
        helper.fs.appendFile('comp3/index.js');
        helper.command.tagIncludeUnmodifiedWithoutBuild('2.0.0');
      });
      it('should set all components versions to the scope flag', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp3.version).to.equal('2.0.0');
        expect(bitMap.comp1.version).to.equal('2.0.0');
        expect(bitMap.comp2.version).to.equal('2.0.0');
      });
    });
  });
  describe('using --incremented-by flag', () => {
    let afterFirstTag: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      afterFirstTag = helper.scopeHelper.cloneWorkspace();
    });
    describe('increment the default (patch)', () => {
      before(() => {
        helper.fixtures.populateComponents(3, undefined, 'v2-patch');
        helper.command.tagAllWithoutBuild('--increment-by 4');
      });
      it('should set the specified version to the modified component and bumped by patch the auto-tagged', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.version).to.equal('0.0.5');
        expect(bitMap.comp2.version).to.equal('0.0.5');
        expect(bitMap.comp3.version).to.equal('0.0.5');
      });
    });
    describe('increment the default (minor)', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstTag);
        helper.fixtures.populateComponents(3, undefined, 'v2-minor');
        helper.command.tagAllWithoutBuild('--minor --increment-by 2');
      });
      it('should set the specified version to the modified component and bumped by patch the auto-tagged', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.version).to.equal('0.2.0');
        expect(bitMap.comp2.version).to.equal('0.2.0');
        expect(bitMap.comp3.version).to.equal('0.2.0');
      });
    });
    describe('auto-tag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstTag);
        // modify only comp3. so then comp1 and comp2 are auto-tag pending
        helper.fs.appendFile('comp3/index.js');
        helper.command.tagAllWithoutBuild('--increment-by 3');
      });
      it('should set the specified version to the modified component and bumped by patch the auto-tagged', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.version).to.equal('0.0.4');
        expect(bitMap.comp2.version).to.equal('0.0.4');
        expect(bitMap.comp3.version).to.equal('0.0.4');
      });
    });
  });
  describe('tag pre-release', () => {
    let tagOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager();
      helper.fixtures.populateComponents(3);
      tagOutput = helper.command.tagAllWithoutBuild('--increment prerelease --prerelease-id dev');
    });
    it('should tag all components according to the pre-release version', () => {
      expect(tagOutput).to.have.string('comp1@0.0.1-dev.0');
    });
    describe('increment pre-release', () => {
      before(() => {
        helper.fixtures.populateComponents(3, undefined, 'v2');
        tagOutput = helper.command.tagAllWithoutBuild('--increment prerelease');
      });
      it('should use the last pre-release identifier and increment it', () => {
        expect(tagOutput).to.have.string('comp1@0.0.1-dev.1');
      });
    });
  });
  describe('auto-tag with pre-release', () => {
    let tagOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      tagOutput = helper.command.tagWithoutBuild('comp3', '--unmodified --increment prerelease --prerelease-id dev');
    });
    it('should auto-tag dependents according to the pre-release version', () => {
      expect(tagOutput).to.have.string('comp1@0.0.2-dev.0');
    });
  });
  describe('invalid pre-release after normal tag', () => {
    let result: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      result = helper.general.runWithTryCatch(`bit tag --unmodified --pre-release "h?h"`);
    });
    it('should throw an error', () => {
      expect(result).to.have.string('unable to increment');
    });
    it('should not create a new version', () => {
      const comp = helper.command.catComponent('comp1');
      const ver1Hash = comp.versions['0.0.1'];
      expect(comp.head).to.equal(ver1Hash);
    });
  });
  describe('soft-tag pre-release', () => {
    let tagOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager();
      helper.fixtures.populateComponents(3);
      tagOutput = helper.command.softTag('--pre-release dev');
    });
    it('should save the pre-release name in the .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      const nextVersion = bitMap.comp1.nextVersion;
      expect(nextVersion.version).to.equal('prerelease');
      expect(nextVersion.preRelease).to.equal('dev');
    });
    describe('persist the soft-tag', () => {
      before(() => {
        tagOutput = helper.command.persistTagWithoutBuild();
      });
      it('should use the data in the .bitmap file and tag as a pre-release version', () => {
        expect(tagOutput).to.have.string('comp1@0.0.1-dev.0');
      });
    });
  });
  describe('builder data saved in the model', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
    });
    it('should not save the build data twice', () => {
      const comp1 = helper.command.catComponent('comp1@latest');
      const builderExt = helper.general.getExtension(comp1, Extensions.builder);
      const taskIds = builderExt.data.pipeline.map((p) => `${p.taskId}:${p.taskName}`);
      const taskIdsUniq = uniq(taskIds);
      expect(taskIds.length).to.equal(taskIdsUniq.length);
    });
  });
  describe('soft tag --minor with auto-tag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.fs.appendFile('comp2/index.js');
      helper.command.softTag('--minor');
    });
    it('should not bump the auto-tagged with minor but with patch', () => {
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(bitMap.comp2.nextVersion.version).equal('minor');
      expect(bitMap.comp1.nextVersion.version).equal('patch');
    });
  });
  describe('with tiny cache', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.runCmd('bit config set cache.max.objects 1');
    });
    after(() => {
      helper.command.runCmd('bit config del cache.max.objects');
    });
    // previously, it was throwing "VersionNotFound" and "VersionNotFoundOnFS".
    it('should not throw', () => {
      // don't skip the build here. otherwise, you won't be able to reproduce.
      expect(() => helper.command.tagAllComponents()).not.to.throw();
    });
  });
  describe('package.json update', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
    });
    it('should update package.json on the workspace with the new tag', () => {
      const pkgJson = helper.fs.readJsonFile(
        path.join('node_modules', `@${helper.scopes.remote}/comp1`, 'package.json')
      );
      expect(pkgJson.version).to.equal('0.0.1');
      expect(pkgJson.componentId.version).to.equal('0.0.1');
    });
  });
  describe('tagging a snapped component by specifying the id', () => {
    let tagOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      tagOutput = helper.command.tagWithoutBuild('comp1');
    });
    it('should tag successfully without needing to add --unmodified', () => {
      expect(tagOutput).to.have.string('comp1@0.0.1');
    });
  });
  describe('maintain two main branches 1.x and 2.x, tagging the older branch 1.x with a patch', () => {
    let ver2Head: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild('--ver 1.0.0');
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.tagAllWithoutBuild('--ver 2.0.0');
      ver2Head = helper.command.getHead('comp1');
      helper.command.export();
      helper.command.checkoutVersion('1.0.0', 'comp1', '-x');
      helper.fixtures.populateComponents(1, undefined, 'version101');
      helper.command.tagAllWithoutBuild('--ver 1.0.1 --detach-head');
      helper.command.export();
    });
    after(() => {
      helper.command.resetFeatures();
    });
    it('should keep the head as 2.x and not change it to 1.0.1', () => {
      const comp = helper.command.catComponent('comp1');
      expect(comp.head).to.equal(ver2Head);
    });
    it('should update the .bitmap according to the patch version and not the head', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('1.0.1');
    });
    describe('importing the component to a new workspace', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1', '-x');
      });
      it('should import the latest: 2.x and not the patch 1.01', () => {
        const bitmap = helper.bitMap.read();
        expect(bitmap.comp1.version).to.equal('2.0.0');
      });
    });
  });
});
