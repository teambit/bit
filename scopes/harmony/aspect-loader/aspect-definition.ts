import type { Component } from '@teambit/component';
import { AspectDefinition as GenericAspectDefinition } from '@teambit/harmony.modules.aspect-loader-contracts';
import type { AspectDefinitionProps as GenericAspectDefinitionProps } from '@teambit/harmony.modules.aspect-loader-contracts';

export const AspectDefinition = GenericAspectDefinition;
export type AspectDefinition = GenericAspectDefinition<Component>;
export type AspectDefinitionProps = GenericAspectDefinitionProps<Component>;
