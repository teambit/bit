import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HASH_SIZE } from '../../src/constants';
import * as fixtures from '../fixtures/fixtures';

describe('bit snap command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap before tag', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.snapComponent('bar/foo');
    });
    it('should snap successfully', () => {
      expect(output).to.have.string('1 component(s) snapped');
    });
    it('should save the snap head in the component object', () => {
      const foo = helper.command.catComponent('bar/foo');
      expect(foo).to.have.property('snaps');
      expect(foo.snaps).to.have.property('head');
      expect(foo.snaps.head).to.be.a('string');
      expect(foo.snaps.head.length).to.equal(HASH_SIZE);
    });
    it('should save the snap hash as a version in .bitmap file', () => {
      const listScope = helper.command.listLocalScopeParsed();
      const hash = listScope[0].localVersion;
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`bar/foo@${hash}`);
    });
    it('bit status should show the snap as staged', () => {
      const status = helper.command.status();
      expect(status).to.have.string('staged components');
    });
    describe('then tag', () => {
      let tagOutput: string;
      before(() => {
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        tagOutput = helper.command.tagAllComponents();
      });
      it('should tag successfully', () => {
        expect(tagOutput).to.have.string('1 component(s) tagged');
      });
      it('should change the snap head to the newly created version', () => {
        const barFoo = helper.command.catComponent('bar/foo');
        const hash = barFoo.versions['0.0.1'];
        expect(barFoo.snaps.head).to.equal(hash);
      });
    });
  });
  describe('components with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.snapAllComponents();
    });
    it('should save the dependencies successfully with their snaps as versions', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      expect(barFoo.dependencies).to.have.lengthOf(1);
      expect(barFoo.dependencies[0].id.version)
        .to.be.a('string')
        .and.have.lengthOf(HASH_SIZE);
    });
  });
});
