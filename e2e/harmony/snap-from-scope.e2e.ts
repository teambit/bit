import chai, { expect } from 'chai';
import { BuildStatus, Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('snap components from scope', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap from scope', () => {
    let bareTag;
    let beforeSnappingOnScope: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponents();
      helper.command.export();

      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareTag.scopePath);
    });
    describe('snapping them all at the same time without dependencies changes', () => {
      let data;
      before(() => {
        data = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            message: `msg for first comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp2`,
            message: `msg for second comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp3`,
            message: `msg for third comp`,
          },
        ];
        // console.log('data', JSON.stringify(data));
        helper.command.snapFromScope(bareTag.scopePath, data);
      });
      it('should save the snap-message according to what provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareTag.scopePath);
        expect(comp2OnBare.log.message).to.equal('msg for second comp');
        const comp3OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp3@latest`, bareTag.scopePath);
        expect(comp3OnBare.log.message).to.equal('msg for third comp');
      });
      it('should not run the build pipeline by default', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareTag.scopePath);
        expect(comp2OnBare.buildStatus).to.equal(BuildStatus.Pending);
      });
      describe('running with --push flag', () => {
        before(() => {
          helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareTag.scopePath);
          helper.command.tagFromScope(bareTag.scopePath, data, '--push');
        });
        it('should export the modified components to the remote', () => {
          const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareTag.scopePath);
          const comp1OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
          expect(comp2OnBare.head).to.equal(comp1OnRemote.head);

          const comp3OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp3`, bareTag.scopePath);
          const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp3`, helper.scopes.remotePath);
          expect(comp3OnBare.head).to.equal(comp2OnRemote.head);
        });
      });
    });
    describe('snapping with dependencies changes', () => {
      before(() => {
        helper = new Helper();
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(3);
        helper.command.tagWithoutBuild();
        helper.command.tagWithoutBuild('comp3', '--skip-auto-tag --unmodified');
        helper.command.export();
        bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
        beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareTag.scopePath);
        const data = [
          {
            componentId: `${helper.scopes.remote}/comp2`,
            dependencies: [`${helper.scopes.remote}/comp3@0.0.2`],
            message: `msg for second comp`,
          },
        ];
        // console.log('data2', JSON.stringify(data2));
        helper.command.snapFromScope(bareTag.scopePath, data);
      });
      it('should save the dependency version according to the version provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareTag.scopePath);
        expect(comp2OnBare.dependencies[0].id.name).to.equal('comp3');
        expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.2');

        expect(comp2OnBare.flattenedDependencies[0].name).to.equal('comp3');
        expect(comp2OnBare.flattenedDependencies[0].version).to.equal('0.0.2');

        const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
        const dep = depResolver.dependencies.find((d) => d.id.includes('comp3'));
        expect(dep.version).to.equal('0.0.2');
      });
    });
  });
  describe('snap on lane', () => {
    let bareScope;
    let comp1FirstSnap: string;
    let beforeSnappingOnScope: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      comp1FirstSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();

      bareScope = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareScope.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareScope.scopePath);
    });
    describe('snapping them all at the same time without dependencies changes', () => {
      let data;
      before(() => {
        data = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            message: `msg for first comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp2`,
            message: `msg for second comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp3`,
            message: `msg for third comp`,
          },
        ];
        // console.log('data', JSON.stringify(data));
        helper.command.snapFromScope(bareScope.scopePath, data, `--lane ${helper.scopes.remote}/dev`);
      });
      it('should not snap on main', () => {
        const comp1OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1`, bareScope.scopePath);
        expect(comp1OnBare.head).to.be.undefined;
      });
      it('should snap on the lane', () => {
        const snapOnLane = helper.command.getHeadOfLane('dev', 'comp1', bareScope.scopePath);
        expect(snapOnLane).to.not.equal(comp1FirstSnap);
        const snapObj = helper.command.catObject(snapOnLane, true, bareScope.scopePath);
        expect(snapObj.parents[0]).to.equal(comp1FirstSnap);
      });
      describe('running with --push flag', () => {
        before(() => {
          helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareScope.scopePath);
          helper.command.snapFromScope(bareScope.scopePath, data, `--push --lane ${helper.scopes.remote}/dev`);
        });
        it('should export the modified components to the remote', () => {
          const snapOnLaneOnBareScope = helper.command.getHeadOfLane('dev', 'comp1', bareScope.scopePath);
          const snapOnLaneOnRemote = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
          expect(snapOnLaneOnBareScope).to.equal(snapOnLaneOnRemote);
        });
      });
    });
  });
  describe('snap on a lane when the component is new to the lane and the scope', () => {
    let bareScope;
    let beforeSnappingOnScope: string;
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1, false);
      helper.command.setScope(scopeName, 'comp1');
      helper.command.snapAllComponentsWithoutBuild();
      // snap multiple times on main. these snaps will be missing locally during the snap-from-scope
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      bareScope = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareScope.scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, bareScope.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareScope.scopePath);
    });
    describe('running with --push flag', () => {
      before(() => {
        const data = [
          {
            componentId: `${anotherRemote}/comp1`,
            message: `msg`,
          },
        ];
        helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareScope.scopePath);
        helper.command.snapFromScope(bareScope.scopePath, data, `--push --lane ${helper.scopes.remote}/dev`);
      });
      // previously, it was throwing an error during the export:
      // error: version "ebf5f55d3b8f1897cb1ac4f236b058b4ddd0c701" of component bnbu2jms-remote2/comp1 was not found on the filesystem. try running "bit import". if it doesn't help, try running "bit import bnbu2jms-remote2/comp1 --objects"
      // because it was trying to export previous snaps from main although they were not imported locally
      it('should export successfully to the remote', () => {
        const snapOnLaneOnBareScope = helper.command.getHeadOfLane('dev', 'comp1', bareScope.scopePath);
        const snapOnLaneOnRemote = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(snapOnLaneOnBareScope).to.equal(snapOnLaneOnRemote);
      });
    });
  });
  describe('snap with file changes', () => {
    let bareTag;
    let files;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/foo.ts');
      helper.command.snapAllComponents();
      helper.command.export();

      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);

      const data = [
        {
          componentId: `${helper.scopes.remote}/comp1`,
          message: `msg for first comp`,
          files: [
            {
              path: 'index.js',
              content: 'index-has-changed',
            },
            {
              path: 'foo.ts',
              delete: true,
            },
            {
              path: 'bar.ts',
              content: 'bar-has-created',
            },
          ],
        },
      ];
      // console.log('data', JSON.stringify(data));
      helper.command.snapFromScope(bareTag.scopePath, data);
      const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, bareTag.scopePath);
      files = comp.files;
    });
    it('should change existing files', () => {
      const indexFile = files.find((f) => f.relativePath === 'index.js');
      const indexFileContent = helper.command.catObject(indexFile.file, false, bareTag.scopePath);
      expect(indexFileContent).to.include('index-has-changed');
    });
    it('should delete files', () => {
      const fooFile = files.find((f) => f.relativePath === 'foo.ts');
      expect(fooFile).to.be.undefined;
    });
    it('should create files', () => {
      const barFile = files.find((f) => f.relativePath === 'bar.ts');
      const barFileContent = helper.command.catObject(barFile.file, false, bareTag.scopePath);
      expect(barFileContent).to.include('bar-has-created');
    });
  });
  describe('snap a new component', () => {
    let catComp;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      const bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);

      const data = [
        {
          componentId: `${helper.scopes.remote}/foo`,
          files: [
            {
              path: 'index.ts',
              content: 'index-has-changed',
            },
            {
              path: 'bar.ts',
              content: 'bar-has-created',
            },
            {
              path: 'id-input.compositions.tsx',
              content: `import React, { useState } from 'react';
import { IdInput } from './id-input';

export const BasicIdInput = () => {
  const [id, setId] = useState('');
  return <IdInput id={id} onChange={e => setId(e.target.value)} />;
};`,
            },
          ],
          isNew: true,
          aspects: {
            'teambit.react/react': {},
            'teambit.envs/envs': {
              env: 'teambit.react/react',
            },
          },
          newDependencies: [
            {
              id: `${helper.scopes.remote}/comp1`,
            },
            {
              id: `${helper.scopes.remote}/comp2`,
              type: 'dev',
            },
            {
              id: 'lodash',
              version: '4.17.21',
              isComponent: false,
              type: 'peer',
            },
          ],
        },
      ];
      // console.log('data', JSON.stringify(data));
      helper.command.snapFromScope(bareTag.scopePath, data);
      catComp = helper.command.catComponent(`${helper.scopes.remote}/foo@latest`, bareTag.scopePath);
    });
    it('should add the specified component and package dependencies', () => {
      expect(catComp.peerPackageDependencies).to.have.property('lodash');
      expect(catComp.dependencies[0].id.name).to.equal('comp1');
      expect(catComp.devDependencies[0].id.name).to.equal('comp2');
    });
    it('should add dependencies from the env', () => {
      const depResolver = catComp.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
      const react = depResolver.dependencies.find((d) => d.id === 'react');
      expect(react).to.not.be.undefined;
      expect(react.source).to.equal('env');
    });
    it('should generate composition aspect data', () => {
      const composition = catComp.extensions.find((e) => e.name === 'teambit.compositions/compositions');
      expect(composition).to.not.be.undefined;
      expect(composition.data.compositions).to.have.lengthOf(1);
    });
    it('should generate dev-files aspect data', () => {
      const devFiles = catComp.extensions.find((e) => e.name === 'teambit.component/dev-files');
      expect(devFiles).to.not.be.undefined;
      expect(devFiles.data.devPatterns).to.not.be.undefined;
    });
  });
  describe('snap a new component in a new lane and existing dependency', () => {
    let catLane;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      const bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);

      const data = [
        {
          componentId: `${helper.scopes.remote}/foo`,
          files: [
            {
              path: 'index.ts',
              content: '',
            },
          ],
          isNew: true,
          aspects: {
            'teambit.react/react': {},
            'teambit.envs/envs': {
              env: 'teambit.react/react',
            },
          },
          newDependencies: [
            {
              id: `${helper.scopes.remote}/comp1`,
              isComponent: true,
              type: 'runtime',
            },
          ],
        },
      ];
      // console.log('data', JSON.stringify(data));
      helper.command.snapFromScope(bareTag.scopePath, data, `--lane ${helper.scopes.remote}/dev`);
      catLane = helper.command.catLane('dev', bareTag.scopePath);
    });
    it('should create the lane and snap the new component into the new lane', () => {
      expect(catLane.components).to.have.lengthOf(1);
    });
  });
  describe('adding dependents to the lane with --update-dependents flag', () => {
    let comp3HeadOnLane: string;
    let comp2HeadOnMain: string;
    let remoteScope: string;
    let snapResult: Record<string, any>;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      comp2HeadOnMain = helper.command.getHead('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
      comp3HeadOnLane = helper.command.getHeadOfLane('dev', 'comp3');
      helper.command.export();
      const bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
      const data = [
        {
          componentId: `${helper.scopes.remote}/comp2`,
          // dependencies: [`${helper.scopes.remote}/comp3@latest`],
          message: 'msg',
        },
      ];
      const flags = `--lane ${helper.scopes.remote}/dev --update-dependents --push`;
      // console.log('data', JSON.stringify(data), 'flags', flags);
      snapResult = helper.command.snapFromScopeParsed(bareTag.scopePath, data, flags);
      remoteScope = helper.scopeHelper.cloneRemoteScope();
    });
    it('should add the snapped component to the updateDependents prop and export it correctly to the remote', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(lane).to.have.property('updateDependents');
      expect(lane.updateDependents).to.have.lengthOf(1);

      const updatedComp = lane.updateDependents[0];
      const comp2 = helper.command.catComponent(updatedComp, helper.scopes.remotePath);
      expect(comp2.dependencies[0].id.name).to.equal('comp3');
      expect(comp2.dependencies[0].id.version).to.equal(comp3HeadOnLane);
    });
    it('should not add the snapped component to the components prop of the lane', () => {
      const lane = helper.command.catLane('dev', helper.scopes.remotePath);
      expect(lane.components).to.have.lengthOf(1);
      expect(lane.components[0].id.name).to.equal('comp3');
    });
    it('should indicate what components were exported', () => {
      expect(snapResult.exportedIds).to.have.lengthOf(1);
    });
    describe('running bit-sign', () => {
      it('should not throw', () => {
        const signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, signRemote.scopePath);

        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp2OnLane = lane.updateDependents[0];
        const signCmd = () =>
          helper.command.sign(
            [comp2OnLane, `${helper.scopes.remote}/comp3@${comp3HeadOnLane}`],
            `--lane ${helper.scopes.remote}/dev`,
            signRemote.scopePath
          );
        expect(signCmd).to.not.throw();
      });
    });
    describe('merging the lane into main from the scope', () => {
      let bareMerge;
      before(() => {
        bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');
      });
      it('should merge also the updateDependents components and export them successfully', () => {
        const comp2 = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
        expect(comp2.head).to.not.equal(comp2HeadOnMain);

        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        const comp2OnLane = lane.updateDependents[0];
        const comp2OnLaneVer = comp2OnLane.split('@')[1];
        expect(comp2.head).to.equal(comp2OnLaneVer);
      });
    });
    describe('importing the lane to a new workspace', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.importLane('dev', '-x');
      });
      it('should not import the updateDependents components', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.not.have.property('comp2');
      });
      it('should not import the objects of the components in the updateDependents prop', () => {
        expect(() => helper.command.catComponent(`${helper.scopes.remote}/comp2`)).to.throw();
      });
      it('should import the lane with the updateDependents prop', () => {
        const lane = helper.command.catLane('dev');
        expect(lane).to.have.property('updateDependents');
        expect(lane.updateDependents).to.have.lengthOf(1);
      });
      describe('importing the component of the updateDependents to the workspace', () => {
        before(() => {
          helper.command.importComponent('comp2');
        });
        it('should import the component from main, not from the lane', () => {
          const bitmap = helper.bitMap.read();
          expect(bitmap).to.have.property('comp2');
          expect(bitmap.comp2.version).to.equal('0.0.1');
        });
        describe('snapping and exporting the component', () => {
          before(() => {
            helper.command.snapAllComponentsWithoutBuild(); // it's modified because the comp3 version is changed
            helper.command.export();
          });
          it('on the remote, it should remove the component from the updateDependents array', () => {
            const lane = helper.command.catLane('dev', helper.scopes.remotePath);
            expect(lane).to.not.have.property('updateDependents');
          });
        });
      });
    });
    describe('updating a component in the lane then running update-dependencies command to update the dependents', () => {
      let updateDepsOutput: string;
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.importLane('dev', '-x');
        helper.command.snapComponentWithoutBuild('comp3', '--skip-auto-snap --unmodified');
        helper.command.export();

        const updateRemote = helper.scopeHelper.getNewBareScope('-remote-update');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, updateRemote.scopePath);

        const data = [
          {
            componentId: `${helper.scopes.remote}/comp2`,
            dependencies: [`${helper.scopes.remote}/comp3`],
          },
        ];
        // console.log('updateRemote.scopePath', updateRemote.scopePath);
        // console.log(`bit update-dependencies '${JSON.stringify(data)}' --lane ${helper.scopes.remote}/dev`);
        try {
          updateDepsOutput = helper.command.updateDependencies(
            data,
            `--lane ${helper.scopes.remote}/dev`,
            updateRemote.scopePath
          );
        } catch (err: any) {
          updateDepsOutput = err.message;
        }
      });
      // it's currently failing because comp3 is not in the npm registry, that's fine.
      // all we care about here is that it won't fail because it cannot find the version of the dependency
      it('should not throw an error saying it cannot find the version of the dependency', () => {
        expect(updateDepsOutput).to.not.include('unable to find a version');
        expect(updateDepsOutput).to.include('comp3 is not in the npm registry'); // not a mandatory test
      });
    });
    describe('updating the dependent of the dependent', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        const bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
        const data = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            message: 'msg',
          },
        ];
        const flags = `--lane ${helper.scopes.remote}/dev --update-dependents --push`;
        // console.log('data', JSON.stringify(data), 'flags', flags);
        snapResult = helper.command.snapFromScopeParsed(bareTag.scopePath, data, flags);
      });
      it('should update successfully with dependencies from update-dependents and export it correctly', () => {
        const lane = helper.command.catLane('dev', helper.scopes.remotePath);
        expect(lane).to.have.property('updateDependents');
        expect(lane.updateDependents).to.have.lengthOf(2);

        const comp1Str = lane.updateDependents.find((c) => c.includes('comp1'));
        const comp2Str = lane.updateDependents.find((c) => c.includes('comp2'));
        const comp2Ver = comp2Str.split('@')[1];
        const comp1 = helper.command.catComponent(comp1Str, helper.scopes.remotePath);
        expect(comp1.dependencies[0].id.name).to.equal('comp2');
        expect(comp1.dependencies[0].id.version).to.equal(comp2Ver);
      });
    });
  });
  describe('updating packages (not components)', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/index.js', 'require("lodash.get")');
      helper.npm.addFakeNpmPackage('lodash.get', '4.4.2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const bareSnap = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
      const data = [
        {
          componentId: `${helper.scopes.remote}/comp1`,
          dependencies: ['lodash.get@4.5.0'],
        },
      ];
      // console.log('data', JSON.stringify(data));
      helper.command.snapFromScope(bareSnap.scopePath, data, '--push');
    });
    it('should update the package', () => {
      const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      expect(comp.packageDependencies['lodash.get']).to.equal('4.5.0');

      const depResolver = comp.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
      const lodash = depResolver.dependencies.find((p) => p.id === 'lodash.get');
      expect(lodash.version).to.equal('4.5.0');
    });
  });
  describe('update-dependents when the dependency is an env', () => {
    let snapResult;
    let bareSnap;
    let envSnapOnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomNewEnv();
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', envName);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild(envName, '--skip-auto-snap --unmodified');
      envSnapOnLane = helper.command.getHeadOfLane('dev', envName);
      helper.command.export();
      bareSnap = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareSnap.scopePath);
      const data = [
        {
          componentId: `${helper.scopes.remote}/comp1`,
          message: 'msg',
        },
      ];
      const flags = `--lane ${helper.scopes.remote}/dev --update-dependents `;
      // console.log(`bit _snap '${JSON.stringify(data)}' ${flags}`);
      snapResult = helper.command.snapFromScopeParsed(bareSnap.scopePath, data, flags);
    });
    it('should save the env with the version it has on the lane', () => {
      const snappedId = snapResult.snappedIds[0];
      const catComp1 = helper.command.catComponent(snappedId, bareSnap.scopePath);
      expect(catComp1.extensions[0].extensionId.version).to.equal(envSnapOnLane);
      expect(catComp1.extensions[0].extensionId.version).to.not.equal('0.0.1');
    });
  });
});
