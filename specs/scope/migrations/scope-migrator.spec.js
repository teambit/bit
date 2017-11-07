import chai from 'chai';
import migrate from '../../../src/scope/migrations/scope-migrator';
import * as simpleComponentObjects from './objectsFixtures/simple-component';
import simpleManifest from './manifests/simple-manifest';
import { Component, Symlink, ScopeMeta } from '../../../src/scope/models';

const expect = chai.expect;

describe.skip('scope-migrator.migrate()', () => {
  let clonedComponent;
  let clonedVersion;
  let clonedSymlink;
  let resultObjectsP;
  before(() => {
    // clonedComponent = R.clone(simpleComponentObjects.componentObject);
    clonedComponent = simpleComponentObjects.componentObject.clone();
    clonedVersion = simpleComponentObjects.version1Object.clone();
    clonedSymlink = simpleComponentObjects.symlinkObject.clone();
    resultObjectsP = migrate('0.0.8', simpleManifest, [clonedComponent, clonedSymlink, clonedVersion]);
    return resultObjectsP;
  });
  it('should run all the migration in the correct order for the component objects', () => {
    // resultObjects = await resultObjectsP;
    console.log(resultObjects);
    // resultObjectsP.then((resultObjects) => {
    //   const component = resultObjects.newObjects.filter(obj => obj instanceof Component)[0];
    //   // console.log(component);
    //   console.log(component);
    //   expect(component.migrationVersion).include.ordered.members(['0.10.9', '0.10.10', '0.10.10(2)']);
    // }).catch((err) => {
    //   console.log(err);
    // });
  });
});
