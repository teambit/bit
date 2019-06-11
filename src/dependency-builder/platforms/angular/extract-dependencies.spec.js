import path from 'path';
import { expect } from 'chai';
import extractAngularDependencies from './extract-dependencies';

describe('ExtractAngularDependencies', function () {
  this.timeout(0);
  describe('decorators', () => {
    const fixtureDir = path.join(__dirname, '/../../../../fixtures/angular/decorators');
    let angularDependencies;
    before(() => {
      const fileName = path.join(fixtureDir, 'index.ts');
      const results = extractAngularDependencies(fixtureDir, fileName, {});
      angularDependencies = results.angularDependencies;
    });
    it('should extract html directives', () => {
      const htmlDirective = path.join(fixtureDir, 'my-template.html');
      expect(angularDependencies).to.include(htmlDirective);
    });
    it('should extract css directives', () => {
      const cssDirective = path.join(fixtureDir, 'my-style1.css');
      expect(angularDependencies).to.include(cssDirective);
    });
    it('should extract directives entered as variables', () => {
      const directiveAsVar = path.join(fixtureDir, 'my-style2.css');
      expect(angularDependencies).to.include(directiveAsVar);
    });
  });
  describe('template dependencies', () => {
    const fixtureDir = path.join(__dirname, '/../../../../fixtures/angular/html-deps');
    let angularDependencies;
    before(() => {
      const fileName = path.join(fixtureDir, 'main-component.ts');
      const results = extractAngularDependencies(fixtureDir, fileName, {});
      angularDependencies = results.angularDependencies;
    });
    it('should extract the dependencies from the html template', () => {
      const componentDep = path.join(fixtureDir, 'another-component.ts');
      expect(angularDependencies).to.include(componentDep);
    });
  });
});
