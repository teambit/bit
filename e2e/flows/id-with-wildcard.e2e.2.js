import { expect } from 'chai';
import Helper from '../e2e-helper';
import NoIdMatchWildcard from '../../src/api/consumer/lib/exceptions/no-id-match-wildcard';

describe('component id with wildcard', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('adding components with various namespaces', () => {
    let scopeAfterAdd;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils/is', 'string.js');
      helper.createFile('utils/is', 'type.js');
      helper.createFile('utils/fs', 'read.js');
      helper.createFile('utils/fs', 'write.js');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.addComponent('utils/is/*', { n: 'utils/is' });
      helper.addComponent('utils/fs/*', { n: 'utils/fs' });
      scopeAfterAdd = helper.cloneLocalScope();
    });
    describe('tag with wildcard', () => {
      describe('when wildcard does not match any component', () => {
        it('should not tag any component', () => {
          const output = helper.tagComponent('none/*');
          expect(output).to.have.string('0 component(s) tagged');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.tagComponent('"utils/is/*"');
        });
        it('should indicate the tagged components', () => {
          expect(output).to.have.string('2 component(s) tagged');
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should tag only the matched components', () => {
          const status = helper.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
          expect(status.newComponents).to.have.lengthOf(3);
        });
      });
    });
    describe('untrack with wildcard', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdd);
      });
      describe('when wildcard does not match any component', () => {
        it('should not untrack any component', () => {
          const output = helper.untrackComponent('none/*');
          expect(output).to.have.string('no components untracked');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.untrackComponent('"utils/fs/*"');
        });
        it('should indicate the untracked components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should untrack only the matched components', () => {
          const status = helper.statusJson();
          expect(status.newComponents).to.have.lengthOf(3);
        });
      });
    });
    describe('remove with wildcard', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const removeFunc = () => helper.removeComponent('none/* -s');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.expectToThrow(removeFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          // as an intermediate step, make sure all components are staged
          const status = helper.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(5);

          output = helper.removeComponent('"utils/fs/*" -s');
        });
        it('should indicate the removed components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should remove only the matched components', () => {
          const status = helper.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(3);
        });
      });
    });
    describe('remove from remote with wildcard', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
        helper.exportAllComponents();

        // as an intermediate step, make sure the remote scope has all components
        const ls = helper.listRemoteScopeParsed();
        expect(ls).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const removeFunc = () => helper.removeComponent('none/* --silent --remote');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.expectToThrow(removeFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.removeComponent('"utils/fs/*" --silent --remote');
        });
        it('should indicate the removed components', () => {
          expect(output).to.have.string('utils/fs/read');
          expect(output).to.have.string('utils/fs/write');
        });
        it('should remove only the matched components', () => {
          const ls = helper.listRemoteScopeParsed();
          expect(ls).to.have.lengthOf(3);
        });
      });
    });
    describe('export with wildcard', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.reInitRemoteScope();
        helper.tagAllComponents();

        // as an intermediate step, make sure all components are staged
        const status = helper.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should not export any component', () => {
          const output = helper.exportComponent('"none/*"', undefined, false);
          expect(output).to.have.string('nothing to export');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.exportComponent('"*/fs/*"');
        });
        it('should indicate the exported components', () => {
          expect(output).to.have.string('exported 2 components');
        });
        it('should export only the matched components', () => {
          const ls = helper.listRemoteScopeParsed();
          expect(ls).to.have.lengthOf(2);
        });
        it('should not export the non matched components', () => {
          const status = helper.statusJson();
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
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();

        // as an intermediate step, make sure all components are staged
        const status = helper.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying that no components found', () => {
          const output = helper.runWithTryCatch('bit untag "none/*"');
          expect(output).to.have.string('no components found');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.untag('"*/is/*"');
        });
        it('should indicate the untagged components', () => {
          expect(output).to.have.string('2 component(s) were untagged');
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should untag only the matched components', () => {
          const status = helper.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(3);
          expect(status.newComponents).to.have.lengthOf(2);
        });
      });
    });
    describe('checkout with wildcard', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
        helper.tagScope('0.0.5');

        // as an intermediate step, make sure all components are staged
        const status = helper.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const checkoutFunc = () => helper.checkout('0.0.1 "none/*"');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.expectToThrow(checkoutFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.checkout('0.0.1 "utils/is/*"');
        });
        it('should indicate the checked out components', () => {
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should checkout only the matched components', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('utils/is/string@0.0.1');
          expect(bitMap).to.have.property('utils/is/type@0.0.1');
        });
        it('should not checkout the unmatched components', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('utils/fs/read@0.0.5');
          expect(bitMap).to.have.property('utils/fs/write@0.0.5');
          expect(bitMap).to.have.property('bar/foo@0.0.5');
        });
      });
    });
    describe('merge with wildcard', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
        helper.tagScope('0.0.5');

        // as an intermediate step, make sure all components are staged
        const status = helper.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const mergeFunc = () => helper.mergeVersion('0.0.1 "none/*"');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.expectToThrow(mergeFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.mergeVersion('0.0.1', '"utils/is/*"');
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
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
        helper.createFile('utils/is', 'string.js', '');
        helper.createFile('utils/is', 'type.js', '');
        helper.createFile('utils/fs', 'read.js', '');
        helper.createFile('utils/fs', 'write.js', '');
        helper.createComponentBarFoo('');

        // as an intermediate step, make sure all components are modified (so then they should show
        // an output for diff command)
        const status = helper.statusJson();
        expect(status.modifiedComponent).to.have.lengthOf(5);
      });
      describe('when wildcard does not match any component', () => {
        it('should throw an error saying the wildcard does not match any id', () => {
          const diffFunc = () => helper.diff('"none/*"');
          const error = new NoIdMatchWildcard(['none/*']);
          helper.expectToThrow(diffFunc, error);
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.diff('"utils/is/*"');
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
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
        output = helper.listLocalScope('--namespace "bar/*"');
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
        helper.getClonedLocalScope(scopeAfterAdd);
        helper.tagAllComponents();
        helper.reInitRemoteScope();
        helper.exportAllComponents();
        output = helper.listRemoteScope(true, '--namespace "bar/*"');
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
