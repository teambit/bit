export { default as Component } from './component';
export { default as ComponentFactoryExt, ComponentExtension } from './component.extension';
export { ComponentID } from './id';
export { default as ComponentFS } from './component-fs';
export { default as ComponentConfig } from './config';
export { ComponentFactory } from './component-factory';
// TODO: check why it's not working when using the index in snap dir like this:
// export { Snap, Author } from './snap';
export { Snap } from './snap/snap';
export { Author } from './snap/author';
// TODO: check why it's not working when using the index in tag dir like this:
// export { Tag } from './tag';
export { Tag } from './tag/tag';
export { State } from './state';
export { Hash } from './hash';
export { TagMap } from './tag-map';
