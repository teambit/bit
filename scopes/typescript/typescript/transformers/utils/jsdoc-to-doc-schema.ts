/* eslint-disable no-fallthrough */
import {
  getTextOfJSDocComment,
  JSDocParameterTag,
  JSDocPropertyLikeTag,
  JSDocPropertyTag,
  JSDocReturnTag,
  JSDocTag,
  SyntaxKind,
} from 'typescript';
import {
  PropertyLikeTagSchema,
  ReturnTagSchema,
  TagName,
  TagSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { Formatter } from '@teambit/formatter';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { typeNodeToSchema } from './type-node-to-schema';

export async function tagParser(
  tag: JSDocTag,
  context: SchemaExtractorContext,
  formatter: Formatter
): Promise<TagSchema> {
  // for some reason, in some cases, if `tag.getSourceFile()` is not provided to the `getText()`, it throws "Cannot read property 'text' of undefined"

  switch (tag.kind) {
    case SyntaxKind.JSDocReturnTag:
      return returnTag(tag as JSDocReturnTag, context);
    case SyntaxKind.JSDocPropertyTag:
      return propertyLikeTag(tag as JSDocPropertyTag, context);
    case SyntaxKind.JSDocParameterTag:
      return propertyLikeTag(tag as JSDocParameterTag, context);
    case SyntaxKind.JSDocAugmentsTag:
      return simpleTag(tag, TagName.augments, context);
    case SyntaxKind.JSDocAuthorTag:
      return simpleTag(tag, TagName.author, context);
    case SyntaxKind.JSDocClassTag:
      return simpleTag(tag, TagName.class, context);
    case SyntaxKind.JSDocCallbackTag:
      return simpleTag(tag, TagName.callback, context);
    case SyntaxKind.JSDocPublicTag:
      return simpleTag(tag, TagName.public, context);
    case SyntaxKind.JSDocPrivateTag:
      return simpleTag(tag, TagName.private, context);
    case SyntaxKind.JSDocProtectedTag:
      return simpleTag(tag, TagName.protected, context);
    case SyntaxKind.JSDocReadonlyTag:
      return simpleTag(tag, TagName.readonly, context);
    case SyntaxKind.JSDocOverrideTag:
      return simpleTag(tag, TagName.override, context);
    case SyntaxKind.JSDocDeprecatedTag:
      return simpleTag(tag, TagName.deprecated, context);
    case SyntaxKind.JSDocSeeTag:
      return simpleTag(tag, TagName.see, context);
    case SyntaxKind.JSDocEnumTag:
      return simpleTag(tag, TagName.enum, context);
    case SyntaxKind.JSDocThisTag:
      return simpleTag(tag, TagName.this, context);
    case SyntaxKind.JSDocTypeTag:
      return simpleTag(tag, TagName.type, context);
    case SyntaxKind.JSDocTemplateTag:
      return simpleTag(tag, TagName.template, context);
    case SyntaxKind.JSDocTypedefTag:
      return simpleTag(tag, TagName.typedef, context);
    case SyntaxKind.JSDocImplementsTag:
      return simpleTag(tag, TagName.implements, context);
    default: {
      const tagName: TagName | string = tag.tagName.getText(tag.getSourceFile());
      if (tagName === 'example') {
        const comment = getTextOfJSDocComment(tag.comment);
        try {
          const formattedComment = comment && (await formatter.formatSnippet(comment));
          return new TagSchema(context.getLocation(tag), tagName, formattedComment);
        } catch (e) {
          return simpleTag(tag, tagName, context);
        }
      }
      return simpleTag(tag, tagName, context);
    }
  }
}

function simpleTag(tag: JSDocTag, tagName: TagName | string, context: SchemaExtractorContext): TagSchema {
  return new TagSchema(context.getLocation(tag), tagName, getTextOfJSDocComment(tag.comment));
}

async function returnTag(tag: JSDocReturnTag, context: SchemaExtractorContext) {
  const type = tag.typeExpression?.type ? await typeNodeToSchema(tag.typeExpression?.type, context) : undefined;
  return new ReturnTagSchema(context.getLocation(tag), getTextOfJSDocComment(tag.comment), type);
}

async function propertyLikeTag(tag: JSDocPropertyLikeTag, context: SchemaExtractorContext) {
  const type = tag.typeExpression?.type ? await typeNodeToSchema(tag.typeExpression?.type, context) : undefined;
  return new PropertyLikeTagSchema(
    context.getLocation(tag),
    tag.name.getText(),
    getTextOfJSDocComment(tag.comment),
    type
  );
}
