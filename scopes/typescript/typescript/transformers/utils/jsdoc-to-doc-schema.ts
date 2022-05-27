/* eslint-disable no-fallthrough */
import { getTextOfJSDocComment, JSDocReturnTag, JSDocTag, Node, SyntaxKind } from 'typescript';
import { getJsDoc, canHaveJsDoc } from 'tsutils';
import pMapSeries from 'p-map-series';
import { DocSchema, ReturnTagSchema, TagName, TagSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { typeNodeToSchema } from './type-node-to-schema';

export async function jsDocToDocSchema(node: Node, context: SchemaExtractorContext): Promise<DocSchema | undefined> {
  if (!canHaveJsDoc(node)) {
    return undefined;
  }
  const jsDocs = getJsDoc(node);
  if (!jsDocs.length) {
    return undefined;
  }
  // not sure how common it is to have multiple JSDocs. never seen it before.
  // regardless, in typescript implementation of methods like `getJSDocDeprecatedTag()`, they use the first one. (`getFirstJSDocTag()`)
  const jsDoc = jsDocs[0];
  const location = context.getLocation(jsDoc);
  const comment = getTextOfJSDocComment(jsDoc.comment);
  const tags = jsDoc.tags ? await pMapSeries(jsDoc.tags, (tag) => tagParser(tag, context)) : undefined;
  return new DocSchema(location, comment, tags);
}

async function tagParser(tag: JSDocTag, context: SchemaExtractorContext): Promise<TagSchema> {
  let tagName: TagName | string = tag.tagName.getText();
  switch (tag.kind) {
    case SyntaxKind.JSDocReturnTag:
      return returnTag(tag as JSDocReturnTag, context);
    case SyntaxKind.JSDocAugmentsTag:
      tagName = TagName.augments;
    case SyntaxKind.JSDocAuthorTag:
      tagName = TagName.author;
    case SyntaxKind.JSDocClassTag:
      tagName = TagName.class;
    case SyntaxKind.JSDocCallbackTag:
      tagName = TagName.callback;
    case SyntaxKind.JSDocPublicTag:
      tagName = TagName.public;
    case SyntaxKind.JSDocPrivateTag:
      tagName = TagName.private;
    case SyntaxKind.JSDocProtectedTag:
      tagName = TagName.protected;
    case SyntaxKind.JSDocReadonlyTag:
      tagName = TagName.readonly;
    case SyntaxKind.JSDocOverrideTag:
      tagName = TagName.override;
    case SyntaxKind.JSDocDeprecatedTag:
      tagName = TagName.deprecated;
    case SyntaxKind.JSDocSeeTag:
      tagName = TagName.see;
    case SyntaxKind.JSDocEnumTag:
      tagName = TagName.enum;
    case SyntaxKind.JSDocParameterTag:
      tagName = TagName.parameter;
    case SyntaxKind.JSDocThisTag:
      tagName = TagName.this;
    case SyntaxKind.JSDocTypeTag:
      tagName = TagName.type;
    case SyntaxKind.JSDocTemplateTag:
      tagName = TagName.template;
    case SyntaxKind.JSDocTypedefTag:
      tagName = TagName.typedef;
    case SyntaxKind.JSDocPropertyTag:
      tagName = TagName.property;
    case SyntaxKind.JSDocImplementsTag:
      tagName = TagName.implements;
    default:
      return simpleTag(tag, tagName, context);
  }
}

function simpleTag(tag: JSDocTag, tagName: TagName | string, context: SchemaExtractorContext): TagSchema {
  return new TagSchema(context.getLocation(tag), tagName, getTextOfJSDocComment(tag.comment));
}

async function returnTag(tag: JSDocReturnTag, context: SchemaExtractorContext) {
  const type = tag.typeExpression?.type ? await typeNodeToSchema(tag.typeExpression?.type, context) : undefined;
  return new ReturnTagSchema(context.getLocation(tag), TagName.return, getTextOfJSDocComment(tag.comment), type);
}
