import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();

describe('angular', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
  });
  describe('adding a component without its styles and templates', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createFile(
        'bar',
        'foo.ts',
        `import { NgModule, Component } from '@angular/core';
@Component({
  selector: 'main-component',
  templateUrl: './my-template.html',
  styleUrl: './my-style.css'
})
export class MainComponent {}

@NgModule({
  imports: [],
  exports: [MainComponent],
  declarations: [MainComponent],
  bootstrap: [MainComponent]
})
export class AppModule {}

      `
      );
      helper.addComponent('bar/foo.ts', { i: 'bar/foo' });
    });
    it('bit status should show an error about missing templates and style dependencies', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.string('non-existing dependency files');
      expect(output).to.have.string('bar/foo.ts -> ./my-template.html, ./my-style.css');
    });
    describe('after creating the template and styles', () => {
      before(() => {
        helper.createFile('bar', 'my-template.html');
        helper.createFile('bar', 'my-style.css');
        helper.addComponent('bar', { i: 'bar/foo ' });
      });
      it('should not warn about it anymore', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('non-existing dependency files');
        expect(output).to.not.have.string('my-template.html');
        expect(output).to.not.have.string('my-style.css');
      });
    });
  });
  describe('ng-lightning', () => {
    let localWorkspace;
    before(() => {
      helper.runCmd('git clone https://github.com/ng-lightning/ng-lightning');
      helper.runCmd('git checkout v4.8.1', path.join(helper.localScopePath, 'ng-lightning'));
      localWorkspace = path.join(helper.localScopePath, 'ng-lightning/projects/ng-lightning');
      helper.initWorkspace(localWorkspace);
      helper.runCmd('bit add src/lib/badges', localWorkspace);
    });
    describe('isolating a component that has public_api.js on the root dir', () => {
      before(() => {
        helper.runCmd('bit isolate badges --use-capsule -d my-capsule', localWorkspace);
      });
      it('should not override the public_api.ts file with the generated entry-point file with the same name', () => {
        const publicApi = fs.readFileSync(path.join(localWorkspace, 'my-capsule/public_api.ts')).toString();
        expect(publicApi).to.have.string("export * from './badge'");
        expect(publicApi).to.not.have.string("export * from './index'");
      });
    });
  });
});
