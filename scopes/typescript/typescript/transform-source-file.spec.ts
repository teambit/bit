import { expect } from 'chai';
import ts from 'typescript';
import {
  transformSourceFile,
  classNamesTransformer,
  functionNamesTransformer,
  importTransformer,
  interfaceNamesTransformer,
  typeAliasNamesTransformer,
  variableNamesTransformer,
  expressionStatementTransformer,
  exportTransformer,
} from './sourceFileTransformers';

function normalizeFormatting(code: string): string {
  const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });
  return printer.printFile(sourceFile);
}

describe('transformSourceFile', () => {
  const createTransformerTest = (
    sourceCode: string,
    nameMapping: any,
    transformer: (nameMapping: any) => ts.TransformerFactory<ts.SourceFile>,
    expectedCode: string
  ) => {
    it(`should correctly transform source code with ${transformer.name}`, async () => {
      const result = await transformSourceFile('test.ts', sourceCode, [transformer(nameMapping)]);
      const normalizedResult = normalizeFormatting(result);
      const normalizedExpectedCode = normalizeFormatting(expectedCode);

      expect(normalizedResult).to.equal(normalizedExpectedCode);
    });
  };

  const testCases = [
    {
      transformer: classNamesTransformer,
      sourceCode: 'class TestClass {}',
      nameMapping: { TestClass: 'NewClassName' },
      expectedCode: 'class NewClassName {}',
    },
    {
      transformer: functionNamesTransformer,
      sourceCode: 'function testFunction() {}',
      nameMapping: { testFunction: 'newFunctionName' },
      expectedCode: 'function newFunctionName() {}',
    },
    {
      transformer: importTransformer,
      sourceCode: 'import { Test } from "./test";',
      nameMapping: { './test': './newTest' },
      expectedCode: 'import { Test } from "./newTest";',
    },
    {
      transformer: interfaceNamesTransformer,
      sourceCode: 'interface TestInterface {}',
      nameMapping: { TestInterface: 'NewInterfaceName' },
      expectedCode: 'interface NewInterfaceName {}',
    },
    {
      transformer: typeAliasNamesTransformer,
      sourceCode: 'type TestType = string;',
      nameMapping: { TestType: 'NewTypeName' },
      expectedCode: 'type NewTypeName = string;',
    },
    {
      transformer: variableNamesTransformer,
      sourceCode: 'let testVariable = "test";',
      nameMapping: { testVariable: 'newVariableName' },
      expectedCode: 'let newVariableName = "test";',
    },
    {
      transformer: classNamesTransformer,
      sourceCode: 'class TestClass { oldMethod() {} }',
      nameMapping: { TestClass: 'NewClassName', oldMethod: 'newMethodName' },
      expectedCode: 'class NewClassName { newMethodName() {} }',
    },
    {
      transformer: classNamesTransformer,
      sourceCode: 'class TestClass { oldMember: string; }',
      nameMapping: { TestClass: 'NewClassName', oldMember: 'newMember' },
      expectedCode: 'class NewClassName { newMember: string; }',
    },
    {
      transformer: expressionStatementTransformer,
      sourceCode: 'TestClass.staticMethod();',
      nameMapping: { TestClass: 'NewClassName', staticMethod: 'newMethodName' },
      expectedCode: 'NewClassName.newMethodName();',
    },
    {
      transformer: expressionStatementTransformer,
      sourceCode: 'let instance = new TestClass(); instance.method();',
      nameMapping: { TestClass: 'NewClassName', method: 'newMethodName' },
      expectedCode: 'let instance = new NewClassName(); instance.newMethodName();',
    },
    {
      transformer: interfaceNamesTransformer,
      sourceCode: 'interface TestInterface { oldMember: string; }',
      nameMapping: { TestInterface: 'NewInterfaceName', oldMember: 'newMember' },
      expectedCode: 'interface NewInterfaceName { newMember: string; }',
    },
    {
      transformer: importTransformer,
      sourceCode: 'const UI = require("@xxx/ui-library");',
      nameMapping: { '@xxx/ui-library': '@abc/ui-library' },
      expectedCode: 'const UI = require("@abc/ui-library");',
    },
    {
      transformer: exportTransformer,
      sourceCode: 'export { Component } from "@xxx/ui-library";',
      nameMapping: { '@xxx/ui-library': '@abc/ui-library' },
      expectedCode: 'export { Component } from "@abc/ui-library";',
    },
    {
      transformer: exportTransformer,
      sourceCode: 'export * from "@xxx/ui-library";',
      nameMapping: { '@xxx/ui-library': '@abc/ui-library' },
      expectedCode: 'export * from "@abc/ui-library";',
    },
    {
      transformer: exportTransformer,
      sourceCode: 'export { default as UI } from "@xxx/ui-library";',
      nameMapping: { '@xxx/ui-library': '@abc/ui-library' },
      expectedCode: 'export { default as UI } from "@abc/ui-library";',
    },
  ];

  for (const { transformer, sourceCode, nameMapping, expectedCode } of testCases) {
    createTransformerTest(sourceCode, nameMapping, transformer, expectedCode);
  }

  it('should return original source code if no transformations are applied', async () => {
    const sourceCode = 'class TestClass {} function testFunction() {}';
    const result = await transformSourceFile('test.ts', sourceCode, []);
    const normalizedResult = normalizeFormatting(result);
    const normalizedSourceCode = normalizeFormatting(sourceCode);
    expect(normalizedResult).to.equal(normalizedSourceCode);
  });

  it('should handle multiple transformers', async () => {
    const sourceCode = 'class TestClass {} function testFunction() {}';
    const expectedCode = 'class NewClassName {} function newFunctionName() {}';
    const result = await transformSourceFile('test.ts', sourceCode, [
      classNamesTransformer({ TestClass: 'NewClassName' }),
      functionNamesTransformer({ testFunction: 'newFunctionName' }),
    ]);
    const normalizedResult = normalizeFormatting(result);
    const normalizedExpectedCode = normalizeFormatting(expectedCode);
    expect(normalizedResult).to.equal(normalizedExpectedCode);
  });
});
