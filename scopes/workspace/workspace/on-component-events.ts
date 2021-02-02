import { Component, ComponentID, AspectData } from '@teambit/component';

export type SerializableResults = { results: any; toString: () => string };
export type OnComponentChange = (component: Component) => Promise<SerializableResults>;
export type OnComponentAdd = (component: Component) => Promise<SerializableResults>;
export type OnComponentRemove = (componentId: ComponentID) => Promise<SerializableResults>;
export type OnComponentEventResult = { extensionId: string; results: SerializableResults };

export type OnComponentLoad = (component: Component) => Promise<AspectData>;
