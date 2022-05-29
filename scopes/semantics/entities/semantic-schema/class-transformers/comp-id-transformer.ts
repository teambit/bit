import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { TransformationType } from 'class-transformer';

export function componentIdTransformer({
  value,
  type,
}: {
  value: ComponentID | ComponentIdObj | undefined;
  type: TransformationType;
}): ComponentID | ComponentIdObj | undefined {
  if (!value) {
    return undefined;
  }
  if (type === TransformationType.PLAIN_TO_CLASS) {
    return ComponentID.fromObject(value as ComponentIdObj);
  }
  if (type === TransformationType.CLASS_TO_CLASS) {
    return value as ComponentID;
  }
  // it's CLASS_TO_PLAIN
  return (value as ComponentID).toObject();
}
