import pMapSeries from 'p-map-series';
import { compact } from 'lodash';
import { ClassSchema, GetAccessorSchema, SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, ClassDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { getParams } from './utils/get-params';

export class ClassDecelerationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ClassDeclaration;
  }

  // @todo: in case of `export default class` the class has no name.
  private getName(node: ClassDeclaration) {
    return node.name?.getText() || 'default';
  }

  async getIdentifiers(node: ClassDeclaration) {
    return [new ExportIdentifier(this.getName(node), node.getSourceFile().fileName)];
  }

  async transform(node: ClassDeclaration, context: SchemaExtractorContext) {
    const className = this.getName(node);
    const members = await pMapSeries(node.members, async (member) => {
      const isPrivate = member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
      if (isPrivate) {
        return null;
      }
      switch (member.kind) {
        case ts.SyntaxKind.GetAccessor: {
          const getter = member as ts.GetAccessorDeclaration;
          const info = await context.getQuickInfo(getter.name);
          const displaySig = info?.body?.displayString || '';
          const typeStr = parseTypeFromQuickInfo(info);
          const type = await context.resolveType(getter, typeStr);
          return new GetAccessorSchema(context.getLocation(getter), getter.name.getText(), type, displaySig);
        }
        case ts.SyntaxKind.SetAccessor: {
          const setter = member as ts.SetAccessorDeclaration;
          const params = await getParams(setter.parameters, context);
          const displaySig = await context.getQuickInfoDisplayString(setter.name);
          return new SetAccessorSchema(context.getLocation(setter), setter.name.getText(), params[0], displaySig);
        }
        default:
          return context.computeSchema(member);
      }
    });
    return new ClassSchema(className, compact(members), context.getLocation(node));
  }
}
