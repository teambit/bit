import styles from './component-node.module.scss';

export { ComponentNode } from './component-node';

export { defaultNodeColor, rootNodeColor, externalNodeColor, root, defaultNode, external } from './variants';

const { compNode, firstRow, envIcon, breadcrumbs, nameLine, name, version, buffs, link } = styles;
export {
  compNode as compNodeClass,
  firstRow as firstRowClass,
  envIcon as envIconClass,
  breadcrumbs as breadcrumbsClass,
  nameLine as nameLineClass,
  name as nameClass,
  version as versionClass,
  buffs as buffsClass,
  link as linkClass,
};
