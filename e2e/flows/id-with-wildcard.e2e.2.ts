import { expect } from 'chai';

import NoIdMatchWildcard from '../../src/api/consumer/lib/exceptions/no-id-match-wildcard';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('component id with wildcard', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding components with various namespaces', () => {
    let scopeAfterAdd;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils/is', 'string.js');
      helper.fs.createFile('utils/is', 'type.js');
      helper.fs.createFile('utils/fs', 'read.js');
      helper.fs.createFile('utils/fs', 'write.js');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.addComponent('utils/is/*', { n: 'utils/is' });
      helper.command.addComponent('utils/fs/*', { n: 'utils/fs' });
      scopeAfterAdd = helper.scopeHelper.cloneLocalScope();
    });
    describe('tag with wildcard', () => {
      describe('when wildcard does not match any component', () => {
        it('should not tag any component', () => {
          const output = helper.command.tagComponent('none/*');
          expect(output).to.have.string('nothing to tag');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.tagComponent('"utils/is/*"');
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
    describe('untrack with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
      });
      describe('when wildcard does not match any component', () => {
        it('should not untrack any component', () => {
          const output = helper.command.untrackComponent('none/*');
          expect(output).to.have.string('no components untracked');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.untrackComponent('"utils/fs/*"');
        });
        it('should indicate the untracked components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should untrack only the matched components', () => {
          const status = helper.command.statusJson();
          expect(status.newComponents).to.have.lengthOf(3);
        });
      });
    });
    describe('remove with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllComponents();
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const removeFunc = () => helper.command.removeComponent('none/*');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.general.expectToThrow(removeFunc, error);
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
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

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
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.command.removeComponent(`${helper.scopes.remote}/*`);

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
        helper.command.tagAllComponents();

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should not export any component', () => {
          const output = helper.command.exportComponent('"none/*"', undefined, false);
          expect(output).to.have.string('nothing to export');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.command.exportComponent('"*/fs/*"');
        });
        it('should indicate the exported components', () => {
          expect(output).to.have.string('exported 2 components');
        });
        it('should export only the matched components', () => {
          const ls = helper.command.listRemoteScopeParsed();
          expect(ls).to.have.lengthOf(2);
        });
        it('should not export the non matched components', () => {
          const status = helper.command.statusJson();
          // (staged components were not exported)
          expect(status.stagedComponents).to.have.lengthOf(3);
          expect(status.stagedComponents).to.include('bar/foo');
          expect(status.stagedComponents).to.include('utils/is/string');
          expect(status.stagedComponents).to.include('utils/is/type');
        });
      });
    });
    describe('untag with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllComponents();

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying that no components found', () => {
          const output = helper.general.runWithTryCatch('bit untag "none/*"');
          expect(output).to.have.string('no components found');
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
        helper.command.tagAllComponents();
        helper.command.tagScope('0.0.5');

        // as an intermediate step, make sure all components are staged
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const checkoutFunc = () => helper.command.checkout('0.0.1 "none/*"');
          const error = new NoIdMatchWildcard(['none/*']);
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
          expect(bitMap).to.have.property('utils/is/string@0.0.1');
          expect(bitMap).to.have.property('utils/is/type@0.0.1');
        });
        it('should not checkout the unmatched components', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('utils/fs/read@0.0.5');
          expect(bitMap).to.have.property('utils/fs/write@0.0.5');
          expect(bitMap).to.have.property('bar/foo@0.0.5');
        });
      });
    });
    describe('merge with wildcard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.tagAllComponents();
        helper.command.tagScope('0.0.5');

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
        helper.command.tagAllComponents();
        helper.fs.createFile('utils/is', 'string.js', '');
        helper.fs.createFile('utils/is', 'type.js', '');
        helper.fs.createFile('utils/fs', 'read.js', '');
        helper.fs.createFile('utils/fs', 'write.js', '');
        helper.fixtures.createComponentBarFoo('');

        // as an intermediate step, make sure all components are modified (so then they should show
        // an output for diff command)
        const status = helper.command.statusJson();
        expect(status.modifiedComponent).to.have.lengthOf(5);
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
        helper.command.tagAllComponents();
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
        helper.command.tagAllComponents();
        helper.scopeHelper.reInitRemoteScope();
        helper.command.exportAllComponents();
        output = helper.command.listRemoteScope(true, '--namespace "bar/*"');
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
