import { ComponentAspect } from './component.aspect';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';

export type { GetComponentsOptions } from './get-component-opts';
export type { UseComponentType } from './ui/use-component';
export type { ConsumerComponent };
// `useComponentHost` (UI hook) moved out of this barrel — see comment near
// the UI block below.
export { Component, InvalidComponent } from './component';
export { ComponentID } from '@teambit/component-id';
export { default as ComponentFS } from './component-fs';
export type { Config as ComponentConfig } from './config';
export type {
  ComponentFactory,
  ResolveAspectsOptions,
  FilterAspectsOptions,
  LoadAspectsOptions,
} from './component-factory';
export type { AspectList } from './aspect-list';
export { AspectEntry, AspectData, ResolveComponentIdFunc } from './aspect-entry';
// TODO: check why it's not working when using the index in snap dir like this:
// export { Snap, Author } from './snap';
export { Snap, SnapProps } from './snap/snap';
export type { Author } from './snap/author';
// TODO: check why it's not working when using the index in tag dir like this:
// export { Tag } from './tag';
export { Tag, TagProps } from './tag/tag';
export type { IComponent } from './component-interface';
export { State } from './state';
export type { Hash } from './hash';
export { TagMap } from './tag-map';
export { ComponentMap } from './component-map';
export type { ComponentMain } from './component.main.runtime';
export type { ComponentUI } from './component.ui.runtime';
export type { Section } from './section';
// UI runtime symbols moved out of this barrel so that main-runtime callers
// don't pay for the entire UI graph at module-init. Once babel-lazy was
// removed (it was deferring these requires for free), every `import` from
// `@teambit/component` ended up loading the navbar + dropdown packages even
// for `bit status`. UI callers should import directly from the dist subpath,
// e.g. `import { ComponentModel } from '@teambit/component/dist/ui/component-model'`.
export type { ComponentProviderProps, ComponentDescriptorProviderProps } from './ui/context';
export type { NavPlugin, ConsumePlugin, MenuNavProps } from './ui/menu';
export type { RegisteredComponentRoute, ComponentUrlParams } from './component.route';
export type { ComponentModelProps } from './ui/component-model';
export type { ShowFragment, ShowRow, ShowJSONRow } from './show';
export { Config } from './config';

// export { AspectList } from './aspect-list';
// export { AspectEntry } from './aspect-entry';
export { ComponentAspect };
export default ComponentAspect;
