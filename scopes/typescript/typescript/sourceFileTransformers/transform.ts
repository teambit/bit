import { Formatter } from '@teambit/formatter';
import ts from 'typescript';
import * as path from 'path';
import { EmptyLineEncoder } from './empty-line-encoder';
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
  formatter?: Formatter,
  updates?: Record<string, string>
): Promise<string> {
  const ext = path.extname(sourceFilePath);
  const compatibleExts = ['.ts', '.tsx', '.js', '.jsx'];
  if (!compatibleExts.includes(ext)) {
    if (!updates) return sourceFileContent;
    let transformed = sourceFileContent;
    Object.entries(updates).forEach(([oldStr, newStr]) => {
      const oldStringRegex = new RegExp(oldStr, 'g');
      transformed = transformed.replace(oldStringRegex, newStr);
    });
    return transformed;
  }

  const encoder = new EmptyLineEncoder();
  sourceFileContent = encoder.encode(sourceFileContent);

  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceFileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const transformedResult: ts.TransformationResult<ts.SourceFile> = ts.transform<ts.SourceFile>(
    sourceFile,
    transformers
  );
  const transformedSourceFile: ts.SourceFile = transformedResult.transformed[0] as ts.SourceFile;

  // const _identifierTransformer = identifierTransformer(updates || {});

  // const transformedResultWithIdentifiers: ts.TransformationResult<ts.SourceFile> =
  // ts.transform<ts.SourceFile>(transformedSourceFile, []);
  // const transformedSourceFileWithIdentifiers: ts.SourceFile
  // = transformedResultWithIdentifiers.transformed[0] as ts.SourceFile;

  const printer: ts.Printer = ts.createPrinter({
    removeComments: false,
  });

  let transformedSourceFileStr = printer.printFile(transformedSourceFile);
  transformedSourceFileStr = encoder.decode(transformedSourceFileStr);
  // Remove trailing empty line markers
  const emptyLineComment = `\\s*\\/\\*${encoder.emptyLineMarker}\\*\\/\\s*$`;
  const regex = new RegExp(emptyLineComment, 'g');
  transformedSourceFileStr = transformedSourceFileStr.replace(regex, '');

  const formattedSourceFileStr = await formatter?.formatSnippet(transformedSourceFileStr);
  return formattedSourceFileStr || transformedSourceFileStr;
}

// function createMarkingTransformer<T extends ts.Node>(innerTransformer: ts.TransformerFactory<T>)
// : ts.TransformerFactory<T> {
//     return context => {
//       const innerTransform = innerTransformer(context);

//       return node => {
//         const result = innerTransform(node);

//         // Add a custom property to the node to mark it as transformed
//         // Note: this relies on TypeScript's internal behavior and may not be stable across versions
//         (result as any).__transformed = true;

//         return result;
//       };
//     };
//   }

//   const defaultTransformer: ts.TransformerFactory<ts.SourceFile> = () => {
//     const visit: ts.Visitor = node => {
//       // If the node has been marked as transformed by a specific transformer, don't transform it
//       if ((node as any).__transformed) {
//         return node;
//       }

//       // Your transformation logic goes here...
//     };

//     return node => ts.visitNode(node, visit);
//   };
