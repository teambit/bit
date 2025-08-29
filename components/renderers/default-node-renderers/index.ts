import { classRenderer } from '@teambit/api-reference.renderers.class';
import { interfaceRenderer } from '@teambit/api-reference.renderers.interface';
import { typeRenderer } from '@teambit/api-reference.renderers.type';
import { functionRenderer } from '@teambit/api-reference.renderers.function';
import { enumRenderer } from '@teambit/api-reference.renderers.enum';
import { variableRenderer } from '@teambit/api-reference.renderers.variable';
import { unresolvedRenderer } from '@teambit/api-reference.renderers.unresolved';
import { typeRefRenderer } from '@teambit/api-reference.renderers.type-ref';
import { typeUnionRenderer } from '@teambit/api-reference.renderers.type-union';
import { typeIntersectionRenderer } from '@teambit/api-reference.renderers.type-intersection';
import { typeLiteralRenderer } from '@teambit/api-reference.renderers.type-literal';
import { parameterRenderer } from '@teambit/api-reference.renderers.parameter';
import { inferenceTypeRenderer } from '@teambit/api-reference.renderers.inference-type';
import { typeArrayRenderer } from '@teambit/api-reference.renderers.type-array';
import { tupleTypeRenderer } from '@teambit/api-reference.renderers.tuple-type';
import { thisRenderer } from '@teambit/api-reference.renderers.this';
import { decoratorRenderer } from '@teambit/api-reference.renderers.decorator';

export const defaultNodeRenderers = [
  classRenderer,
  interfaceRenderer,
  typeRenderer,
  functionRenderer,
  enumRenderer,
  variableRenderer,
  unresolvedRenderer,
  typeRefRenderer,
  typeUnionRenderer,
  typeIntersectionRenderer,
  typeLiteralRenderer,
  parameterRenderer,
  inferenceTypeRenderer,
  typeArrayRenderer,
  tupleTypeRenderer,
  thisRenderer,
  decoratorRenderer,
];

export {
  classRenderer,
  interfaceRenderer,
  typeRenderer,
  functionRenderer,
  enumRenderer,
  variableRenderer,
  unresolvedRenderer,
  typeRefRenderer,
  typeUnionRenderer,
  typeIntersectionRenderer,
  typeLiteralRenderer,
  parameterRenderer,
  inferenceTypeRenderer,
  typeArrayRenderer,
  tupleTypeRenderer,
  thisRenderer,
  decoratorRenderer,
};

export default defaultNodeRenderers;
