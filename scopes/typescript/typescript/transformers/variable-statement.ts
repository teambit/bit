import { SchemaNode, Module } from '@teambit/semantics.entities.semantic-schema';
import { compact } from 'lodash';
import pMapSeries from 'p-map-series';
import ts, { Node, VariableStatement } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

/**
 * variable statement is a collection of variable declarations.
 * e.g. `export const a = 1, b = () => {}, c = {};`
 */
export class VariableStatementTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.VariableStatement;
  }

  async getIdentifiers(node: VariableStatement) {
    return node.declarationList.declarations.map((dec) => {
      return new ExportIdentifier(dec.name.getText(), dec.getSourceFile().fileName);
    });
  }

  async transform(node: VariableStatement, context: SchemaExtractorContext): Promise<SchemaNode> {
    const schemas = await pMapSeries(node.declarationList.declarations, async (dec) => {
      // this will get the schema from variable-declaration
      const schema = await context.visitDefinition(dec.name);
      return schema;
    });
    return new Module(context.getLocation(node), compact(schemas));
  }
}
