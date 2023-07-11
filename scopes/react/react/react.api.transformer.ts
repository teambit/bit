import { ReactSchema } from '@teambit/react';
import { FunctionLikeSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodeTransformer } from '@teambit/typescript';

const REACT_FILE_EXT = ['.tsx', '.jsx'];

export class ReactAPITransformer implements SchemaNodeTransformer {
  predicate(node: SchemaNode) {
    const isFunctionLike = node instanceof FunctionLikeSchema;
    if (!isFunctionLike) return false;
    const functionNode = node as FunctionLikeSchema;
    const isReactFile = REACT_FILE_EXT.some((r) => functionNode.location.filePath.includes(r));
    if (!isReactFile) return false;
    const params = functionNode.params;
    if (params.length !== 1) return false;
    return true;
    /**
     *  we can add stricter checks in the future here
     *  check if the param is an TypeReference or an Object
     */
  }

  async transform(node: FunctionLikeSchema): Promise<SchemaNode> {
    return new ReactSchema(
      node.location,
      node.name,
      node.params[0],
      node.returnType,
      node.signature,
      node.modifiers,
      node.doc,
      node.typeParams
    );
  }
}
