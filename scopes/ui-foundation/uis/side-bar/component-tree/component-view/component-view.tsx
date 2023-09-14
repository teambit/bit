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
import { useScope } from '@teambit/scope.ui.hooks.scope-context';
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
  const scope = useScope();

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

  /**
   * this covers the following use cases when matching the active component's href with location
   *
   * 1. viewing main component
   *
   *  - /<component-id>/
   *  - /<component-id>/~sub-route
   *  - /<component-id>/~sub-route/another-sub-route
   *  - /<component-id>/~sub-route?version=<version>
   *
   * 2. viewing a lane component
   *
   *  - /~lane/<lane-id>/<component-id>/
   *  - /~lane/<lane-id>/<component-id>/~sub-route
   *  - /~lane/<lane-id>/<component-id>/~sub-route/another-sub-route
   *  - /~lane/<lane-id>/<component-id>/~sub-route?version=<version>
   *
   * 3. viewing a main component when on a lane
   *
   *  - /?lane=<lane-id>/<component-id>/
   *  - /?lane=<lane-id>/<component-id>/~sub-route
   *  - /?lane=<lane-id>/<component-id>/~sub-route/another-sub-route
   *  - /?lane=<lane-id>/<component-id>/~sub-route?version=<version>
   *
   * 4. viewing currently checked out lane component on workspace
   *
   *  - /<component-id-without-scope>/
   *
   * 5. viewing lane component from the same scope as the lane on a workspace
   *
   * - /~lane/<lane-id>/<component-id-without-scope>/
   *
   * @todo - move this logic to a util function
   */
  const isActive = React.useMemo(() => {
    if (!href || !location) return false;

    const pathname = location.pathname.substring(1).split('?')[0];
    const compIdStr = component.id.toStringWithoutVersion();
    const compIdName = component.id.fullName;

    const sanitizedHref = (href.startsWith('/') ? href.substring(1) : href).split('?')[0];
    // if you are in a workspace, the componentId might not have a scopeId, if you are viewing
    // a component on the checked out lane
    const viewingCheckedOutLaneComp =
      lanesModel?.currentLane && lanesModel.currentLane.id.toString() === lanesModel?.viewedLane?.id.toString();

    if (lanesModel?.viewedLane?.id.isDefault() || viewingMainCompOnLane || viewingCheckedOutLaneComp) {
      // split out any sub routes if exist
      const compUrl = pathname.split('/~')[0];
      // may or may not contain scope
      const scopeUrl = scope.name ? `${scope.name.replace('.', '/')}/` : '';
      return sanitizedHref === compUrl.replace(scopeUrl, '');
    }

    const laneCompUrlWithSubRoutes = pathname.split(LanesModel.baseLaneComponentRoute)[1] ?? '';

    const _laneCompUrl = laneCompUrlWithSubRoutes.split('/~')[0] ?? '';
    const laneCompUrl = _laneCompUrl.startsWith('/') ? _laneCompUrl.substring(1) : _laneCompUrl;

    const laneCompIdFromUrl = ComponentID.tryFromString(laneCompUrl);

    // viewing lane component from the same scope as the lane on a workspace
    const laneAndCompFromSameScopeOnWs =
      !scope.name && lanesModel?.viewedLane?.id && component.id.scope === lanesModel?.viewedLane?.id.scope;

    if (laneAndCompFromSameScopeOnWs) {
      return compIdName === laneCompUrl;
    }

    if (!laneCompIdFromUrl) return false;

    return laneCompIdFromUrl?.toString() === compIdStr || laneCompIdFromUrl.fullName === compIdName;
  }, [href, viewingMainCompOnLane, location?.pathname, component.id.toString(), scope]);

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
