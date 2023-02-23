import ts from 'typescript';
import { expect } from 'chai';

import { TypeScriptParser } from './typescript.parser';

describe('TypescriptParser', () => {
  describe('getExports', () => {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
    // https://www.typescriptlang.org/docs/handbook/modules.html#export

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

    const exampleStatement = `
      function myFunction2 () { return 3; }
      const myVariable2 = 3;
      export { myFunction2, myVariable2 };
    `;

    const exampleRenamedStatement = `
      function myFunction2 () { return 3; }
      const myVariable2 = 3;
      export { myFunction2, myVariable2 as myVariable2Alias };
    `;

    const exampleReExport = `
      export { default as function1, function2 } from "bar.js";
    `;

    const exampleReExportDefault = `
      export { default, function2 } from "bar.js";
    `;

    const exampleRenamedReExportAll = `
      export * as ns from "mod";
    `;

    const exampleExportDefault = `
      const a: number = 1
      export default { a };
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

    it('should parse declarations', () => {
      const ast = ts.createSourceFile('example.tsx', exampleStatement, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportFunction = exports.find((x) => x.identifier === 'myFunction2');
      const exportVariable = exports.find((x) => x.identifier === 'myVariable2');

      expect(exportFunction).to.exist;
      expect(exportVariable).to.exist;
    });

    it('should parse renamed declarations', () => {
      const ast = ts.createSourceFile('example.tsx', exampleRenamedStatement, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportFunction = exports.find((x) => x.identifier === 'myFunction2');
      const exportVariable = exports.find((x) => x.identifier === 'myVariable2Alias');

      expect(exportFunction).to.exist;
      expect(exportVariable).to.exist;
    });

    it('should parse re-exports', () => {
      const ast = ts.createSourceFile('example.tsx', exampleReExport, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportFunction1 = exports.find((x) => x.identifier === 'function1');
      const exportFunction2 = exports.find((x) => x.identifier === 'function2');

      expect(exportFunction1).to.exist;
      expect(exportFunction2).to.exist;
    });

    it('should parse re-exports with default', () => {
      const ast = ts.createSourceFile('example.tsx', exampleReExportDefault, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportFunction1 = exports.find((x) => x.identifier === 'default');
      const exportFunction2 = exports.find((x) => x.identifier === 'function2');

      expect(exportFunction1).not.to.exist;
      expect(exportFunction2).to.exist;
    });

    it('should parse renamed re-exports all', () => {
      const ast = ts.createSourceFile('example.tsx', exampleRenamedReExportAll, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      const exportFunction1 = exports.find((x) => x.identifier === 'ns');

      expect(exportFunction1).to.exist;
    });

    it('should parse default exports', () => {
      const ast = ts.createSourceFile('example.tsx', exampleExportDefault, ts.ScriptTarget.Latest);
      const exports = new TypeScriptParser().getExports(ast);

      expect(exports.length).to.equal(0);
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
