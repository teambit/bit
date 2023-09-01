import { ComponentTreeSlot } from '@teambit/component-tree';
import { Link, useLocation } from '@teambit/base-react.navigation.link';
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
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './component-view.module.scss';

export type ComponentViewProps<Payload = any> = {
  treeNodeSlot?: ComponentTreeSlot;
  useLanes?: () => { lanesModel?: LanesModel };
} & TreeNodeProps<Payload>;

export function ComponentView(props: ComponentViewProps<PayloadType>) {
  const { node } = props;
  const component = node.payload;

  const { onSelect } = useContext(TreeContext);
  const { lanesModel } = (props.useLanes || useLanes)();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );
  const location = useLocation();

  if (!(component instanceof ComponentModel)) return null;
  const envId = ComponentID.fromString(component.environment?.id as string);

  const envTooltip = (
    <Link
      className={styles.envLink}
      href={ComponentUrl.toUrl(envId, {
        includeVersion: true,
        useLocationOrigin: !window.location.host.startsWith('localhost'),
      })}
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

  const href = lanesModel?.getLaneComponentUrlByVersion(component.id, lanesModel.viewedLane?.id);

  const viewingMainCompOnLane = React.useMemo(() => {
    return (
      !lanesModel?.viewedLane?.id.isDefault() &&
      lanesModel?.isComponentOnMainButNotOnLane(component.id, undefined, lanesModel?.viewedLane?.id)
    );
  }, [lanesModel?.viewedLane?.id.toString(), component.id.toString()]);

  const Name = viewingMainCompOnLane ? (
    <Tooltip className={styles.onMainTooltip} placement="right" content={'On Main'}>
      <span>{getName(node.id)}</span>
    </Tooltip>
  ) : (
    <span>{getName(node.id)}</span>
  );

  const isActive = React.useMemo(() => {
    if (!href || !location) return false;
    const pathname = location.pathname.substring(1);
    const hrefWithoutLaneMetadata = href.split('?lane')[0];
    const sanitizedHref = (
      hrefWithoutLaneMetadata.startsWith('/') ? hrefWithoutLaneMetadata.substring(1) : hrefWithoutLaneMetadata
    ).split('?')[0];
    if (pathname === sanitizedHref) return true;
    // viewing main component
    if (viewingMainCompOnLane || lanesModel?.viewedLane?.id.isDefault()) {
      const locationWithoutSubRoutes = pathname.split('/~')[0];
      return locationWithoutSubRoutes === sanitizedHref;
    }
    // viewing a lane component
    const lastIndexOfSubRoute = pathname.lastIndexOf('/~');
    const noSubRoutes =
      pathname.substring(lastIndexOfSubRoute + 1).includes(LanesModel.baseLaneComponentRoute) ||
      pathname.substring(lastIndexOfSubRoute + 1).includes(LanesModel.lanesPrefix);
    if (noSubRoutes) return pathname === sanitizedHref;
    const pathnameWithoutSubRoute = pathname.substring(0, lastIndexOfSubRoute);
    return pathnameWithoutSubRoute === sanitizedHref;
  }, [href, viewingMainCompOnLane, location?.pathname, component.id.toString()]);

  return (
    <Link
      href={href}
      className={classNames(indentClass, styles.component, viewingMainCompOnLane && styles.mainOnly)}
      activeClassName={styles.active}
      onClick={handleClick}
      // exact={true}
      active={isActive}
    >
      <div className={styles.left}>
        <Tooltip className={styles.componentEnvTooltip} placement="right" content={envTooltip}>
          <EnvIcon component={component} className={styles.envIcon} />
        </Tooltip>
        {Name}
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
