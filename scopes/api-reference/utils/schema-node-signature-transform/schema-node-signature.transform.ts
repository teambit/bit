import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';

export function transformSignature({ __schema, signature }: SchemaNode): string | undefined {
  let displaySignature: string | undefined;
  if (!signature) displaySignature = undefined;
  else if (__schema === ConstructorSchema.name && 'constructor') displaySignature = signature;
  else {
    const displaySignatureIndex = signature.indexOf(') ') + 1;
    displaySignature = signature?.slice(displaySignatureIndex).trim().split('.')[1];
  }
  return displaySignature;
}
