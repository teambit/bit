import { SchemaNode, Module, UnresolvedSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, {
  Node,
  SyntaxKind,
  ExportDeclaration as ExportDeclarationNode,
  NamedExports,
  NamespaceExport,
} from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

export class ExportDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportDeclaration;
  }

  async getIdentifiers(exportDec: ExportDeclarationNode, context: SchemaExtractorContext) {
    if (exportDec.exportClause?.kind === ts.SyntaxKind.NamedExports) {
      exportDec.exportClause as NamedExports;
      return exportDec.exportClause.elements.map((elm) => {
        return new ExportIdentifier(elm.name.getText(), elm.getSourceFile().fileName);
      });
    }

    if (exportDec.exportClause?.kind === ts.SyntaxKind.NamespaceExport) {
      return [new ExportIdentifier(exportDec.exportClause.name.getText(), exportDec.getSourceFile().fileName)];
    }

    if (exportDec.moduleSpecifier) {
      return context.getFileExports(exportDec);
    }

    return [];
  }

  async transform(exportDec: ExportDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const exportClause = exportDec.exportClause;

    // it's export-all, e.g. `export * from './button'`;
    if (!exportClause) {
      const specifier = exportDec.moduleSpecifier;
      if (!specifier) {
        throw new Error(`fatal: no specifier`);
      }
      const sourceFile = await context.getSourceFileFromNode(specifier);
      if (!sourceFile) {
        throw new Error(`unable to find the source-file`);
      }
      return context.computeSchema(sourceFile);
    }

    // e.g. `export { button1, button2 } as Composition from './button';
    if (exportClause.kind === SyntaxKind.NamedExports) {
      const schemas = await namedExport(exportClause, context);
      return new Module(context.getLocation(exportDec), schemas);
    }
    // e.g. `export * as Composition from './button';
    if (exportClause.kind === SyntaxKind.NamespaceExport) {
      return namespaceExport(exportClause, exportDec, context);
    }

    // should never reach here. exportClause can be either NamespaceExport or NamedExports
    throw new Error(`unrecognized exportClause type`);
  }
}

async function namedExport(exportClause: NamedExports, context: SchemaExtractorContext): Promise<SchemaNode[]> {
  const schemas = await Promise.all(
    exportClause.elements.map(async (element) => {
      const definitionInfo = await context.definitionInfo(element);
      if (!definitionInfo) {
        // happens for example when the main index.ts file exports variable from an mdx file.
        // tsserver is unable to get the definition node because it doesn't know to parse mdx files.
        return new UnresolvedSchema(context.getLocation(element.name), element.name.getText());
      }
      const definitionNode = await context.definition(definitionInfo);
      if (!definitionNode) {
        return context.getTypeRefForExternalNode(element);
      }
      if (definitionNode.parent.kind === SyntaxKind.ExportSpecifier) {
        // the definition node is the same node as element.name. tsserver wasn't able to find the source for it
        // normally, "bit install" should fix it. another option is to open vscode and look for errors.
        throw new Error(`error: tsserver is unable to locate the identifier "${element.name.getText()}" at ${context.getLocationAsString(
          element.name
        )}.
make sure "bit status" is clean and there are no errors about missing packages/links.
also, make sure the tsconfig.json in the root has the "jsx" setting defined.`);
      }
      return context.computeSchema(definitionNode.parent);
    })
  );

  return schemas;
}

async function namespaceExport(
  exportClause: NamespaceExport,
  exportDec: ExportDeclarationNode,
  context: SchemaExtractorContext
) {
  const namespace = exportClause.name.getText();
  const filePath = await context.getFilePathByNode(exportClause.name);
  if (!filePath) {
    throw new Error(`unable to find the file-path for "${namespace}"`);
  }
  const sourceFile = context.getSourceFileInsideComponent(filePath);
  if (!sourceFile) {
    // it's a namespace from another component or an external package.
    return context.getTypeRefForExternalPath(namespace, filePath, context.getLocation(exportDec));
  }
  const result = await context.computeSchema(sourceFile);
  if (!(result instanceof Module)) {
    throw new Error(`expect result to be instance of Module`);
  }
  result.namespace = namespace;
  return result;
}
