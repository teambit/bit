import { Formatter } from '@teambit/formatter';
import ts from 'typescript';
import * as path from 'path';

/**
 * Transforms a TypeScript source file using the provided transformer.
 *
 * @param sourceFilePath Path to the TypeScript source file.
 * @param sourceFileContent The content of the source file.
 * @param transformers The transformers to be applied on the source file.
 * @param formatter (Optional) An optional formatter to format the transformed code. If no formatter is provided, the function returns the transformed source file as a string without any formatting.
 * @returns A promise that resolves to the transformed source file as a string.
 */
export async function transformSourceFile(
  sourceFilePath: string,
  sourceFileContent: string,
  transformers: ts.TransformerFactory<ts.SourceFile>[],
  formatter?: Formatter
): Promise<string> {
  const ext = path.extname(sourceFilePath);
  if (ext !== '.ts' && ext !== '.tsx') {
    return sourceFileContent;
  }

  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceFileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const result: ts.TransformationResult<ts.SourceFile> = ts.transform<ts.SourceFile>(sourceFile, transformers);

  const transformedSourceFile: ts.SourceFile = result.transformed[0] as ts.SourceFile;

  const printer: ts.Printer = ts.createPrinter({
    removeComments: false,
  });

  const transformedSourceFileStr = printer.printFile(transformedSourceFile);
  const formattedSourceFileStr = await formatter?.formatSnippet(transformedSourceFileStr);
  return formattedSourceFileStr || transformedSourceFileStr;
}
