import chai, { expect } from 'chai';
import * as path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('relative paths flow (components requiring each other by relative paths)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding directories and using relative-paths', () => {
    let appOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope(helper.scopes.remote);
      appOutput = helper.fixtures.populateComponents(2, false);
    });
    it('bit status should show it as an invalid component', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(1);
      expect(status.componentsWithIssues[0].id).to.equal('comp1');
    });
    it('should block bit tag', () => {
      const output = helper.general.runWithTryCatch('bit tag -a');
      const RelativeComponentAuthoredClass = IssuesClasses.relativeComponentsAuthored;
      expect(output).to.have.string(new RelativeComponentAuthoredClass().description);
      expect(output).to.have.string('index.js -> "../comp2" (comp2)');
    });
    describe('replacing relative paths by module paths', () => {
      let linkOutput;
      before(() => {
        linkOutput = helper.command.linkAndRewire();
      });
      it('should rewire successfully', () => {
        expect(linkOutput).to.have.string('rewired 1 components and total of 1 files');
      });
      it('should not show the component as an invalid anymore', () => {
        const status = helper.command.statusJson();
        expect(status.invalidComponents).to.have.lengthOf(0);
      });
      describe('tagging the component', () => {
        let tagOutput;
        before(() => {
          helper.command.compile();
          tagOutput = helper.command.tagAllComponents();
        });
        it('should allow tagging the component', () => {
          expect(tagOutput).to.have.string('2 component(s) tagged');
        });
        it('bitmap record should have rootDir and files relative to the rootDir', () => {
          const bitMap = helper.bitMap.read();
          const componentMap = bitMap.comp1;
          expect(componentMap.rootDir).to.equal('comp1');
          expect(componentMap.mainFile).to.equal('index.js');
        });
        it('app should work after rewiring', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result).to.have.string(appOutput);
        });
        describe('should work after importing to another workspace', () => {
          before(() => {
            helper.command.exportToDefaultAndRewire();
            helper.scopeHelper.reInitLocalScopeHarmony();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('*');
          });
          it('should write the component files with the short dirs (without rootDir)', () => {
            expect(path.join(helper.scopes.localPath, helper.scopes.remote, 'comp1/index.js')).to.be.a.file();
          });
          it('should not generate link files', () => {
            expect(path.join(helper.scopes.localPath, 'components/comp1/comp2')).not.to.be.a.path();
          });
          it('app should work', () => {
            helper.fs.outputFile(
              'app.js',
              `const comp1 = require('@${helper.scopes.remote}/comp1');\nconsole.log(comp1())`
            );
            const result = helper.command.runCmd('node app.js');
            expect(result).to.have.string(appOutput);
          });
        });
      });
    });
  });
});
