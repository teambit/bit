import { Component, ComponentID, AspectData } from '@teambit/component';
import { CompilationInitiator } from '@teambit/compiler';

export type SerializableResults = { results: any; toString: () => string };
export type OnComponentChange = (
  component: Component,
  files: string[],
  initiator?: CompilationInitiator
) => Promise<SerializableResults>;
export type OnComponentAdd = (component: Component, files: string[]) => Promise<SerializableResults>;
export type OnComponentRemove = (componentId: ComponentID) => Promise<SerializableResults>;
export type OnComponentEventResult = { extensionId: string; results: SerializableResults };

export type OnComponentLoadOptions = {
  loadDocs?: boolean;
  loadCompositions?: boolean;
};
export type OnComponentLoad = (component: Component, opts?: OnComponentLoadOptions) => Promise<AspectData | undefined>;
