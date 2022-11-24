import { NoIdMatchPattern } from '@teambit/scope';
import { expect } from 'chai';

import NoIdMatchWildcard from '../../src/api/consumer/lib/exceptions/no-id-match-wildcard';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('component id with wildcard', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding components with various namespaces', () => {
    let scopeAfterAdd;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fs.createFile('utils/is/string', 'string.js');
      helper.fs.createFile('utils/is/type', 'type.js');
      helper.fs.createFile('utils/fs/read', 'read.js');
      helper.fs.createFile('utils/fs/write', 'write.js');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.addComponent('utils/is/*', { n: 'utils/is' });
      helper.command.addComponent('utils/fs/*', { n: 'utils/fs' });
      scopeAfterAdd = helper.scopeHelper.cloneLocalScope();
    });
    describe('tag with wildcard', () => {
      describe('when wildcard does not match any component', () => {
        it('should not tag any component', () => {
          const output = helper.general.runWithTryCatch('bit tag "none/*"');
          expect(output).to.have.string('unable to find any matching for "none/*" pattern');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.tagWithoutBuild('"utils/is/*"');
        });
        it('should indicate the tagged components', () => {
          expect(output).to.have.string('2 component(s) tagged');
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should tag only the matched components', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
          expect(status.newComponents).to.have.lengthOf(3);
        });
      });
    });
    describe('remove with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const removeFunc = () => helper.command.removeComponent('none/*');
          expect(removeFunc).to.throw('unable to find any matching');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          // as an intermediate step, make sure all components are staged
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(5);

          output = helper.command.removeComponent('"utils/fs/*"');
        });
        it('should indicate the removed components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should remove only the matched components', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(3);
        });
      });
    });
    describe('remove from remote with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
        helper.command.export();

        // as an intermediate step, make sure the remote scope has all components
        const ls = helper.command.listRemoteScopeParsed();
        expect(ls).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const removeFunc = () => helper.command.removeComponent(`${helper.scopes.remote}/none/* --remote`);
          const error = new NoIdMatchWildcard([`${helper.scopes.remote}/none/*`]);
          helper.general.expectToThrow(removeFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.removeComponent(`${helper.scopes.remote}/utils/fs/* --remote`);
        });
        it('should indicate the removed components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should remove only the matched components', () => {
          const ls = helper.command.listRemoteScopeParsed();
          expect(ls).to.have.lengthOf(3);
        });
      });
    });
    describe('remove from remote with wildcard after removed locally', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.scopeHelper.reInitRemoteScope();
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        helper.command.removeComponent(`${helper.scopes.remote}/**`);

        // as an intermediate step, make sure the remote scope has all components
        const ls = helper.command.listRemoteScopeParsed();
        expect(ls).to.have.lengthOf(5);

        // as an intermediate step, make sure the local scope does not have any components
        const lsLocal = helper.command.listLocalScopeParsed();
        expect(lsLocal).to.have.lengthOf(0);
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.removeComponent(`${helper.scopes.remote}/utils/fs/* --remote`);
        });
        it('should indicate the removed components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should remove only the matched components', () => {
          const ls = helper.command.listRemoteScopeParsed();
          expect(ls).to.have.lengthOf(3);
        });
      });
    });
    describe('export with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.scopeHelper.reInitRemoteScope();
        helper.command.tagAllWithoutBuild();

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should not export any component', () => {
          const output = helper.command.exportIds('"none/*"', undefined, false);
          expect(output).to.have.string('nothing to export');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.exportIds('"*/fs/*"');
        });
        it('should indicate the exported components', () => {
          expect(output).to.have.string('exported the following 2 component(s)');
        });
        it('should export only the matched components', () => {
          const ls = helper.command.listRemoteScopeParsed();
          expect(ls).to.have.lengthOf(2);
        });
        it('should not export the non matched components', () => {
          const staged = helper.command.getStagedIdsFromStatus();
          // (staged components were not exported)
          expect(staged).to.have.lengthOf(3);
          expect(staged).to.include('bar/foo');
          expect(staged).to.include('utils/is/string');
          expect(staged).to.include('utils/is/type');
        });
      });
    });
    describe('untag with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying that no components found', () => {
          const output = helper.general.runWithTryCatch('bit reset "none/*"');
          expect(output).to.have.string('unable to find any matching');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.untag('"*/is/*"');
        });
        it('should indicate the untagged components', () => {
          expect(output).to.have.string('2 component(s) were untagged');
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should untag only the matched components', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(3);
          expect(status.newComponents).to.have.lengthOf(2);
        });
      });
    });
    describe('checkout with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
        helper.command.tagIncludeUnmodified('0.0.5');

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const checkoutFunc = () => helper.command.checkout('0.0.1 "none/*"');
          const error = new NoIdMatchPattern('none/*');
          helper.general.expectToThrow(checkoutFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.checkout('0.0.1 "utils/is/*"');
        });
        it('should indicate the checked out components', () => {
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should checkout only the matched components', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap['utils/is/string'].version).to.equal('0.0.1');
          expect(bitMap['utils/is/type'].version).to.equal('0.0.1');
        });
        it('should not checkout the unmatched components', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap['utils/fs/read'].version).to.equal('0.0.5');
          expect(bitMap['utils/fs/write'].version).to.equal('0.0.5');
          expect(bitMap['bar/foo'].version).to.equal('0.0.5');
        });
      });
    });
    describe('merge with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
        helper.command.tagIncludeUnmodified('0.0.5');

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          const mergeFunc = () => helper.command.mergeVersion('0.0.1 "none/*"');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.general.expectToThrow(mergeFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.mergeVersion('0.0.1', '"utils/is/*"');
        });
        it('should indicate the merged components', () => {
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should not merge the unmatched components', () => {
          expect(output).to.not.have.string('utils/fs/read');
          expect(output).to.not.have.string('utils/fs/write');
          expect(output).to.not.have.string('bar/foo');
        });
      });
    });
    describe('diff with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
        helper.fs.createFile('utils/is/string', 'string.js', '');
        helper.fs.createFile('utils/is/type', 'type.js', '');
        helper.fs.createFile('utils/fs/read', 'read.js', '');
        helper.fs.createFile('utils/fs/write', 'write.js', '');
        helper.fixtures.createComponentBarFoo('');

        // as an intermediate step, make sure all components are modified (so then they should show
        // an output for diff command)
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const diffFunc = () => helper.command.diff('"none/*"');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.general.expectToThrow(diffFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.diff('"utils/is/*"');
        });
        it('should show diff only for the matched components', () => {
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should not show diff for unmatched unmatched components', () => {
          expect(output).to.not.have.string('utils/fs/read');
          expect(output).to.not.have.string('utils/fs/write');
          expect(output).to.not.have.string('bar/foo');
        });
      });
    });
    describe('list with wildcard', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
        output = helper.command.listLocalScope('--namespace "bar/*"');
      });
      it('should list only for the matched components', () => {
        expect(output).to.have.string('bar/foo');
      });
      it('should not list unmatched components', () => {
        expect(output).to.not.have.string('utils');
      });
    });
    describe('list remote with wildcard', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllWithoutBuild();
        helper.scopeHelper.reInitRemoteScope();
        helper.command.export();
        output = helper.command.listRemoteScopeIds('--namespace "bar/*"');
      });
      it('should list only for the matched components', () => {
        expect(output).to.have.string('bar/foo');
      });
      it('should not list unmatched components', () => {
        expect(output).to.not.have.string('utils');
      });
    });
  });
});
