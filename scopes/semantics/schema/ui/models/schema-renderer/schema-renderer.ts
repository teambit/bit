import {
  ClassSchema,
  EnumSchema,
  FunctionLikeSchema,
  InterfaceSchema,
  SchemaNode,
  VariableLikeSchema,
  TypeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { SchemaTypes } from '@teambit/semantics.schema.ui.models.schema-types';
import { HTMLAttributes, ComponentType } from 'react';

export type SchemaRenderProps<Node extends SchemaNode, Type extends SchemaTypes> = {
  node: Node;
  type: Type;
} & HTMLAttributes<HTMLDivElement>;

export type ClassSchemaNodeRenderer = ComponentType<SchemaRenderProps<ClassSchema, SchemaTypes.Class>>;
export type InterfaceSchemaNodeRenderer = ComponentType<SchemaRenderProps<InterfaceSchema, SchemaTypes.Interface>>;
export type FunctionSchemaNodeRenderer = ComponentType<SchemaRenderProps<FunctionLikeSchema, SchemaTypes.Function>>;
export type VariableSchemaNodeRenderer = ComponentType<SchemaRenderProps<VariableLikeSchema, SchemaTypes.Variable>>;
export type EnumSchemaNodeRenderer = ComponentType<SchemaRenderProps<EnumSchema, SchemaTypes.Enum>>;
export type TypeSchemaNodeRenderer = ComponentType<SchemaRenderProps<TypeSchema, SchemaTypes.Type>>;

export type SchemaNodeRenderer =
  | ClassSchemaNodeRenderer
  | InterfaceSchemaNodeRenderer
  | FunctionSchemaNodeRenderer
  | VariableSchemaNodeRenderer
  | EnumSchemaNodeRenderer
  | TypeSchemaNodeRenderer;
