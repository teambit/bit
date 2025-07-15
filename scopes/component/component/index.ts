import { ComponentAspect } from './component.aspect';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';

export type { GetComponentsOptions } from './get-component-opts';
export type { UseComponentType } from './ui/use-component';
export type { ConsumerComponent };
export { useComponentHost } from './host';
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
export { ComponentContext, ComponentDescriptorContext, useComponentDescriptor } from './ui/context/component-context';
export type { ComponentProviderProps, ComponentDescriptorProviderProps } from './ui/context';
export { ComponentProvider, ComponentDescriptorProvider } from './ui/context';
export { componentFields, componentIdFields, componentOverviewFields } from './ui';
export type { NavPlugin, ConsumePlugin, MenuNavProps } from './ui/menu';
export { CollapsibleMenuNav, ComponentMenu, VersionRelatedDropdowns } from './ui/menu';
export type { RegisteredComponentRoute, ComponentUrlParams } from './component.route';
export type { ComponentModelProps } from './ui/component-model';
export { ComponentModel } from './ui/component-model';
export { TopBarNav } from './ui/top-bar-nav';
export type { ShowFragment, ShowRow, ShowJSONRow } from './show';
export { Config } from './config';
export { useComponent, useIdFromLocation, useComponentLogs, ComponentLogsResult, Filters } from './ui';

// export { AspectList } from './aspect-list';
// export { AspectEntry } from './aspect-entry';
export { ComponentAspect };
export default ComponentAspect;
