import { plainToInstance, TransformationType, ClassConstructor } from 'class-transformer';
import { compact } from 'lodash';
import { SchemaNode } from '../schema-node';
import * as Schemas from '../schemas';

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
  if (!obj.__schema) {
    throw new Error(`fatal: "__schema" is missing, make sure the transformer is set on SchemaNode type`);
  }
  const SchemaClass = getClassBySchemaName(obj.__schema);
  return plainToInstance(SchemaClass, obj);
}

function getClassBySchemaName(schemaName: string): ClassConstructor<SchemaNode> {
  const schemasClasses = compact(Object.values(Schemas));
  const schemaClass = schemasClasses.find((schema) => schema.name === schemaName);
  if (!schemaClass) {
    throw new Error(`unable to find schema "${schemaName}". the following schemas are supported:
${schemasClasses.map((s) => s.name).join(', ')}`);
  }
  return schemaClass;
}
