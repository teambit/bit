import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';

export function transformSignature({ __schema, signature }: SchemaNode): string | undefined {
  if (!signature) return undefined;
  if (__schema === ConstructorSchema.name && 'constructor') return signature;
  const displaySignatureIndex = signature.indexOf(') ') + 1;
  const [, ...displaySignature] = signature.includes('.')
    ? signature?.slice(displaySignatureIndex).trim().split('.')
    : [undefined, signature?.slice(displaySignatureIndex).trim()];
  return displaySignature.join('.');
}
