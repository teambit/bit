import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('support vue files', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('tests scenarios ', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.copyFixtureComponents('vue');
    });
    describe('add vue files', () => {
      before(() => {
        helper.command.addComponent('directives/*.js');
        helper.command.addComponent('styles/*');
        helper.command.addComponent('UiAutocomplete.vue');
        helper.command.runCmd('npm i fuzzysearch');
      });
      it('should find missing vue dependencies', () => {
        const output = helper.command.runCmd('bit s');
        expect(output).to.have.string('untracked file dependencies');
        expect(output).to.have.string('UiAutocomplete.vue -> UiAutocompleteSuggestion.vue, UiIcon.vue');
      });
      describe('after adding the missing files', () => {
        let output;
        before(() => {
          helper.command.addComponent('UiAutocompleteSuggestion.vue');
          helper.command.addComponent('UiIcon.vue');
          output = helper.command.status();
        });
        it('should say that all is resolved', () => {
          expect(output.includes('no new components')).to.be.false;
        });
        it('should display that component as a new component', () => {
          expect(output.includes('new components')).to.be.true;
          expect(output.includes('ui-autocomplete')).to.be.true;
          expect(output.includes('ui-autocomplete-suggestion')).to.be.true;
        });
        it('should not display that component as modified', () => {
          expect(output.includes('modified components')).to.be.false;
        });
        it('should not display that component as staged', () => {
          expect(output.includes('staged components')).to.be.false;
        });
      });
    });
    describe('add vue files that import stylus files ', () => {
      before(() => {
        helper.command.addComponent(path.normalize('StylusExample.vue'));
      });
      it('should find missing vue dependencies', () => {
        const output = helper.command.runCmd('bit s');
        expect(output).to.have.string(' untracked file dependencies');
        expect(output).to.have.string('StylusExample.vue -> stylus/main.styl');
      });
      it('should find missing vue dependencies', () => {
        helper.command.addComponent(path.normalize('stylus/main.styl'));
        const output = helper.command.runCmd('bit s');
        expect(output).to.have.string(' untracked file dependencies');
        expect(output).to.have.string('stylus/main.styl -> stylus/second.styl');
      });
      it('should say that all is resolved', () => {
        helper.command.addComponent(path.normalize('stylus/second.styl'));
        const output = helper.command.runCmd('bit s');
        expect(output.includes('no new components')).to.be.false;
      });
      it('should display that component as a new component', () => {
        const output = helper.command.runCmd('bit s');
        expect(output.includes('new components')).to.be.true;
        expect(output.includes('stylus-example')).to.be.true;
        expect(output.includes('main')).to.be.true;
        expect(output.includes('second')).to.be.true;
      });
      it('should not display that component as modified', () => {
        const output = helper.command.runCmd('bit s');
        expect(output.includes('modified components')).to.be.false;
      });
      it('should not display that component as staged', () => {
        const output = helper.command.runCmd('bit s');
        expect(output.includes('staged components')).to.be.false;
      });
    });
    describe('import vue components', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.copyFixtureComponents('vue');
        helper.command.addComponent(path.normalize('directives/*.js'));
        helper.command.addComponent(path.normalize('styles/*'));
        helper.command.addComponent('UiAutocomplete.vue UiAutocompleteSuggestion.vue UiIcon.vue -n vue');
        helper.command.runCmd('npm i fuzzysearch');
      });

      it('should find missing vue dependencies', () => {
        const output = helper.command.tagAllComponents();
        expect(output).to.have.string('9 component(s) tagged');
      });
      it('should export tagged components', () => {
        const output = helper.command.exportAllComponents();
        expect(output).to.have.string(`exported 9 components to scope ${helper.scopes.remote}`);
      });
      it('should import component', () => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
        const output = helper.command.importComponent('vue/ui-autocomplete');
        expect(output).to.have.string('successfully imported one component');
        expect(output).to.have.string(`${helper.scopes.remote}/vue/ui-autocomplete`);
        expect(output).to.have.string('0.0.1');
      });
    });
  });
  describe('custom module resolutions', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { aliases: { '@': 'directives' } };
      helper.bitJson.write(bitJson);

      const autocompleteFixture = `<script>
import autofocus from '@/autofocus';
</script>`;
      helper.fs.createFile('UI', 'Autocomplete.vue', autocompleteFixture);
      helper.fs.createFile('directives', 'autofocus.js', 'export default {}');
      helper.command.addComponent('UI/Autocomplete.vue', { i: 'ui/autocomplete' });
      helper.command.addComponent('directives/autofocus.js', { i: 'directives/autofocus' });
    });
    it('should recognize dependencies using "@" as an alias', () => {
      const output = helper.command.showComponentParsed('ui/autocomplete');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('directives/autofocus');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('directives/autofocus.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('directives/autofocus.js');
      expect(dependency.relativePaths[0].importSource).to.equal('@/autofocus');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
  });
});
