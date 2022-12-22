import { ComponentAspect } from './component.aspect';

export type { GetComponentsOptions } from './get-component-opts';
export type { UseComponentType } from './ui/use-component';
export { useComponentHost } from './host';
export { Component, InvalidComponent } from './component';
export { ComponentID } from '@teambit/component-id';
export { default as ComponentFS } from './component-fs';
export type { default as ComponentConfig } from './config';
export type { ComponentFactory, ResolveAspectsOptions } from './component-factory';
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
export { Section } from './section';
export { ComponentContext, ComponentDescriptorContext, useComponentDescriptor } from './ui/context/component-context';
export type { ComponentProviderProps, ComponentDescriptorProviderProps } from './ui/context';
export { ComponentProvider, ComponentDescriptorProvider } from './ui/context';
export { componentFields, componentIdFields, componentOverviewFields } from './ui';
export { ConsumePlugin, ComponentMenu, VersionRelatedDropdowns } from './ui/menu';
export { RegisteredComponentRoute, ComponentUrlParams } from './component.route';
export { ComponentModel, ComponentModelProps } from './ui/component-model';
export { TopBarNav } from './ui/top-bar-nav';
export type { ShowFragment, ShowRow, ShowJSONRow } from './show';
export { default as Config } from './config';
export { useComponent, useIdFromLocation } from './ui';

// export { AspectList } from './aspect-list';
// export { AspectEntry } from './aspect-entry';
export { ComponentAspect };
export default ComponentAspect;
