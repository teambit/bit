import { Component, ComponentID, AspectData } from '@teambit/component';
import { CompilationInitiator } from '@teambit/compiler';
import { ComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';

export type SerializableResults = { results: any; toString: () => string };
export type OnComponentChange = (
  component: Component,
  files: string[],
  initiator?: CompilationInitiator
) => Promise<SerializableResults>;
export type OnComponentAdd = (component: Component, files: string[]) => Promise<SerializableResults>;
export type OnComponentRemove = (componentId: ComponentID) => Promise<SerializableResults>;
export type OnComponentEventResult = { extensionId: string; results: SerializableResults };
export type OnMultipleComponentsAdd = () => Promise<void>;

export type OnComponentLoad = (
  component: Component,
  loadOpts?: ComponentLoadOptions
) => Promise<AspectData | undefined>;
