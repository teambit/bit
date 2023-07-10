import ts from 'typescript';
import {
  transformSourceFile,
  classNamesTransformer,
  functionNamesTransformer,
  importPathTransformer,
  interfaceNamesTransformer,
  typeAliasNamesTransformer,
  variableNamesTransformer,
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

      expect(normalizedResult).toBe(normalizedExpectedCode);
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
      transformer: importPathTransformer,
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
  ];

  for (const { transformer, sourceCode, nameMapping, expectedCode } of testCases) {
    createTransformerTest(sourceCode, nameMapping, transformer, expectedCode);
  }

  it('should return original source code if no transformations are applied', async () => {
    const sourceCode = 'class TestClass {} function testFunction() {}';
    const result = await transformSourceFile('test.ts', sourceCode, []);
    const normalizedResult = normalizeFormatting(result);
    const normalizedSourceCode = normalizeFormatting(sourceCode);
    expect(normalizedResult).toBe(normalizedSourceCode);
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
    expect(normalizedResult).toBe(normalizedExpectedCode);
  });
});
