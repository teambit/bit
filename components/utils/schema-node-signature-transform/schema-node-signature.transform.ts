import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';

export function transformSignature({ __schema, signature }: SchemaNode): string | undefined {
  if (!signature) return undefined;
  if (__schema === ConstructorSchema.name && 'constructor') return signature;
  const displaySignatureIndex = signature.indexOf(') ') + 1;
  const [, ...displaySignature] = signature?.slice(displaySignatureIndex).trim().split('.');
  return displaySignature.join('.');
}
