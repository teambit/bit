import { Component, ComponentID, AspectData } from '@teambit/component';
import { CompilationInitiator } from '@teambit/compiler';
import { ComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';
import type { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';

export type SerializableResults = { results: any; toString: () => string };
export type OnComponentChange = (
  component: Component,
  files: PathOsBasedAbsolute[],
  removedFiles?: PathOsBasedAbsolute[],
  initiator?: CompilationInitiator
) => Promise<SerializableResults | void>;
export type OnComponentAdd = (component: Component, files: string[]) => Promise<SerializableResults>;
export type OnComponentRemove = (componentId: ComponentID) => Promise<SerializableResults>;
export type OnComponentEventResult = { extensionId: string; results: SerializableResults };

export type OnComponentLoad = (
  component: Component,
  loadOpts?: ComponentLoadOptions
) => Promise<AspectData | undefined>;
