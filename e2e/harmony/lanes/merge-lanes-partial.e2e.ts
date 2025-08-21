import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('merge lanes - partial merge functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('partial merge', () => {
    describe('from a lane to main', () => {
      let comp1HeadOnLane: string;
      let comp2HeadOnLane: string;
      let comp3HeadOnLane: string;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        helper.command.createLane();
        helper.fixtures.populateComponents(3, undefined, 'version2');
        helper.command.snapAllComponentsWithoutBuild();
        comp1HeadOnLane = helper.command.getHeadOfLane('dev', 'comp1');
        comp2HeadOnLane = helper.command.getHeadOfLane('dev', 'comp2');
        comp3HeadOnLane = helper.command.getHeadOfLane('dev', 'comp3');
        helper.command.export();
        helper.command.switchLocalLane('main');
      });
      describe('without --include-deps', () => {
        it('should throw an error asking to enter --include-deps flag', () => {
          const mergeFn = () => helper.command.mergeLane('dev', `--pattern ${helper.scopes.remote}/comp2`);
          expect(mergeFn).to.throw('consider adding "--include-deps" flag');
        });
      });
      describe('with --include-deps', () => {
        before(() => {
          helper.command.mergeLane('dev', `--pattern ${helper.scopes.remote}/comp2 --include-deps`);
        });
        it('should not merge components that were not part of the patterns nor part of the pattern dependencies', () => {
          const comp1Head = helper.command.getHead(`${helper.scopes.remote}/comp1`);
          expect(comp1Head).to.not.equal(comp1HeadOnLane);
        });
        it('should merge components that merge the pattern', () => {
          const comp2Head = helper.command.getHead(`${helper.scopes.remote}/comp2`);
          expect(comp2Head).to.equal(comp2HeadOnLane);
        });
        it('should merge components that are dependencies of the given pattern', () => {
          const comp3Head = helper.command.getHead(`${helper.scopes.remote}/comp3`);
          expect(comp3Head).to.equal(comp3HeadOnLane);
        });
      });
    });
  });
});
