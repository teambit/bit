import { ComponentTreeSlot } from '@teambit/component-tree';
import { Link } from '@teambit/base-react.navigation.link';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import classNames from 'classnames';
import { ComponentID, ComponentModel } from '@teambit/component';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import React, { useCallback, useContext } from 'react';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './component-view.module.scss';

export type ComponentViewProps<Payload = any> = {
  treeNodeSlot?: ComponentTreeSlot;
} & TreeNodeProps<Payload>;

export function ComponentView(props: ComponentViewProps<PayloadType>) {
  const { node } = props;
  const component = node.payload;

  const { onSelect } = useContext(TreeContext);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );

  if (!(component instanceof ComponentModel)) return null;

  const envId = ComponentID.fromString(component.environment?.id as string);

  const envTooltip = (
    <Link
      className={styles.envLink}
      href={ComponentUrl.toUrl(envId, { includeVersion: true })}
      external={true}
      onClick={(event) => {
        // do not trigger component selection
        event.stopPropagation();
      }}
    >
      <div className={styles.componentEnvTitle}>Environment</div>
      <div>{component.environment?.id}</div>
    </Link>
  );

  return (
    <Link
      href={`/${component.id.fullName}`}
      className={classNames(indentClass, styles.component)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        <Tooltip className={styles.componentEnvTooltip} placement="right" content={envTooltip}>
          <EnvIcon component={component} className={styles.envIcon} />
        </Tooltip>

        <span>{getName(node.id)}</span>
      </div>

      <div className={styles.right}>
        <DeprecationIcon component={component} />
        {/* {isInternal && <Icon of="Internal" className={styles.componentIcon} />} */}
        {props.treeNodeSlot &&
          props.treeNodeSlot.toArray().map(([id, treeNode]) => <treeNode.widget key={id} component={component} />)}
      </div>
    </Link>
  );
}
