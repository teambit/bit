import ts from 'typescript';
import { expect } from 'chai';

import { TypeScriptParser } from './typescript.parser';

describe('TypescriptParser', () => {
  describe('getExports', () => {
    const exampleArrowFunction = `
      export const arrow = () => { return 3; }
      arrow.textProperty = "propertyValue";
    `;

    const exampleFunction = `
      export function func() { return 3; }
      func.textProperty = "propertyValue";
    `;

    const exampleClass = `
      export class classy{ render() { return 3; } }
      classy.textProperty = "propertyValue";
    `;

    it('should parse arrowFunctions', () => {
      const ast = ts.createSourceFile('example.tsx', exampleArrowFunction, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportArrow = exports.find((x) => x.identifier === 'arrow');

      expect(exportArrow).to.exist;
    });

    it('should parse function exports', () => {
      const ast = ts.createSourceFile('example.tsx', exampleFunction, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportFunction = exports.find((x) => x.identifier === 'func');

      expect(exportFunction).to.exist;
    });

    it('should parse classes', () => {
      const ast = ts.createSourceFile('example.tsx', exampleClass, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportClass = exports.find((x) => x.identifier === 'classy');

      expect(exportClass).to.exist;
    });

    describe('staticProperties', () => {
      it('should include staticProperties, when on arrowFunctions', () => {
        const ast = ts.createSourceFile('example.tsx', exampleArrowFunction, ts.ScriptTarget.Latest);
        const exports = new TypeScriptParser().getExports(ast);

        const exportArrow = exports.find((x) => x.identifier === 'arrow');

        expect(exportArrow?.staticProperties?.get('textProperty')).to.equal('propertyValue');
      });

      it('should include staticProperties, when on regular functions', () => {
        const ast = ts.createSourceFile('example.tsx', exampleFunction, ts.ScriptTarget.Latest);
        const exports = new TypeScriptParser().getExports(ast);

        const exportClass = exports.find((x) => x.identifier === 'func');

        expect(exportClass?.staticProperties?.get('textProperty')).to.equal('propertyValue');
      });

      it('should include staticProperties, when on classes', () => {
        const ast = ts.createSourceFile('example.tsx', exampleClass, ts.ScriptTarget.Latest);
        const exports = new TypeScriptParser().getExports(ast);

        const exportClass = exports.find((x) => x.identifier === 'classy');

        expect(exportClass?.staticProperties?.get('textProperty')).to.equal('propertyValue');
      });
    });
  });

  describe('collectStaticProperties', () => {
    const exampleFile = `
      export const hello = () => { return 3; }

      hello.text = "is";
      hello.count = 3;
      hello.nullish = null;
      hello.undef = undefined;
      hello.disable = false;
      hello.enable = true;
      hello.complextLiteral = \`what \${hello.text} it?\`;
      hello.nonAssignedProperty += 'value';
    `;

    it('should parse all primitive values', () => {
      const ast = ts.createSourceFile('example.tsx', exampleFile, ts.ScriptTarget.Latest);
      const staticProperties = new TypeScriptParser().parseStaticProperties(ast);

      expect(staticProperties).to.exist;

      const exportHello = staticProperties.get('hello');
      expect(exportHello).to.exist;

      expect(exportHello?.get('text')).to.equal('is');
      expect(exportHello?.get('count')).to.equal(3);
      expect(exportHello?.get('nullish')).to.equal(null);
      expect(exportHello?.get('undef')).to.equal(undefined);
      expect(exportHello?.get('disable')).to.equal(false);
      expect(exportHello?.get('enable')).to.equal(true);

      expect(exportHello?.has('complextLiteral')).to.be.false;
    });

    it('should skip non primitive values', () => {
      const ast = ts.createSourceFile('example.tsx', exampleFile, ts.ScriptTarget.Latest);
      const staticProperties = new TypeScriptParser().parseStaticProperties(ast);
      const exportHello = staticProperties.get('hello');

      expect(exportHello?.has('complextLiteral')).to.be.false;
    });

    it('should skip non assignment statements', () => {
      const ast = ts.createSourceFile('example.tsx', exampleFile, ts.ScriptTarget.Latest);
      const staticProperties = new TypeScriptParser().parseStaticProperties(ast);
      const exportHello = staticProperties.get('hello');

      expect(exportHello?.has('nonAssignedProperty')).to.be.false;
    });
  });
});
