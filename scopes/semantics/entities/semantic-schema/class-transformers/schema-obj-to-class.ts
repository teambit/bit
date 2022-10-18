import { plainToInstance, TransformationType, ClassConstructor } from 'class-transformer';
import { compact } from 'lodash';
import { SchemaNode } from '../schema-node';
import * as Schemas from '../schemas';
import { UnknownSchema } from '../schemas/unknown-schema';

export function schemaObjArrayToInstances({ value, type }: { value: SchemaNode[]; type: TransformationType }) {
  if (type !== TransformationType.PLAIN_TO_CLASS) {
    return value;
  }
  return value.map((obj) => transformFromObjectToInstance(obj));
}

export function schemaObjToInstance({
  value,
  type,
}: {
  value: Record<string, any> | undefined;
  type: TransformationType;
}) {
  if (type !== TransformationType.PLAIN_TO_CLASS) {
    return value;
  }
  if (!value) {
    return undefined;
  }
  return transformFromObjectToInstance(value);
}

function transformFromObjectToInstance(obj: Record<string, any>): SchemaNode {
  console.log('🚀 ~ file: schema-obj-to-class.ts ~ line 31 ~ transformFromObjectToInstance ~ obj', obj);
  if (!obj.__schema) {
    throw new Error(`fatal: "__schema" is missing, make sure the transformer is set on SchemaNode type`);
  }
  const SchemaClass = getClassBySchemaName(obj.__schema);
  console.log('🚀 ~ file: schema-obj-to-class.ts ~ line 36 ~ transformFromObjectToInstance ~ SchemaClass', SchemaClass);
  if (!SchemaClass) {
    // for backward and forward compatibility, to not break the users, it's better to return an unknown schema than throwing.
    return new UnknownSchema(obj.location || { path: '', line: 0, character: 0 }, obj.__schema, obj);
  }
  console.log('🚀 ~ file: schema-obj-to-class.ts ~ line 41 ~ transformFromObjectToInstance ~ SchemaClass', SchemaClass);

  return plainToInstance(SchemaClass, obj);
}

function getClassBySchemaName(schemaName: string): ClassConstructor<SchemaNode> | null {
  const schemasClasses = compact(Object.values(Schemas));
  console.log('🚀 ~ file: schema-obj-to-class.ts ~ line 48 ~ getClassBySchemaName ~ schemasClasses', schemasClasses);
  const schemaClass = schemasClasses.find((schema) => schema.name === schemaName);
  console.log('🚀 ~ file: schema-obj-to-class.ts ~ line 50 ~ getClassBySchemaName ~ schemaClass', schemaClass);
  if (!schemaClass) {
    return null;
  }
  return schemaClass;
}
