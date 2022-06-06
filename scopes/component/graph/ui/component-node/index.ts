import componentStyles from './component-node.module.scss';

export { ComponentNode } from './component-node';

export { defaultNodeColor, rootNodeColor, externalNodeColor, root, defaultNode, external } from './variants';

const { compNode, firstRow, envIcon, breadcrumbs, nameLine, name, version, buffs, link } = componentStyles;
export const styles = { compNode, firstRow, envIcon, breadcrumbs, nameLine, name, version, buffs, link };
