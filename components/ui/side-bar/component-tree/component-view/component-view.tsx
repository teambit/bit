/* eslint-disable complexity */
import { ComponentTreeSlot } from '@teambit/component-tree';
import { Link, useLocation } from '@teambit/base-react.navigation.link';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import classNames from 'classnames';
import { ComponentID } from '@teambit/component-id';
import { ComponentModel } from '@teambit/component';
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
  scopeName?: string;
} & TreeNodeProps<Payload>;

export function ComponentView(props: ComponentViewProps<PayloadType>) {
  const { node, scopeName } = props;
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
  const scope = { name: scopeName };

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

  const href = lanesModel?.getLaneComponentUrlByVersion(component.id as any, lanesModel.viewedLane?.id, !scope.name);

  const viewingMainCompOnLane = React.useMemo(() => {
    return (
      !component.status?.isNew &&
      !lanesModel?.viewedLane?.id.isDefault() &&
      lanesModel?.isComponentOnMainButNotOnLane(component.id as any, undefined, lanesModel?.viewedLane?.id)
    );
  }, [lanesModel?.viewedLane?.id.toString(), component.id.toString()]);

  const Name = viewingMainCompOnLane ? (
    <Tooltip className={styles.onMainTooltip} placement="top" content={'On Main'}>
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
   *  - /<component-id>/~sub-route?scope=<scope>
   *  - /<component-id>?scope=<scope>
   *
   * 2. viewing a lane component
   *
   *  - /~lane/<lane-id>/<component-id>/
   *  - /~lane/<lane-id>/<component-id>?scope=<scope>
   *  - /~lane/<lane-id>/<component-id>/~sub-route
   *  - /~lane/<lane-id>/<component-id>/~sub-route/another-sub-route
   *  - /~lane/<lane-id>/<component-id>/~sub-route?version=<version>
   *  - /~lane/<lane-id>/<component-id>/~sub-route?scope=<scope>
   *
   * 3. viewing a main component when on a lane
   *
   *  - /?lane=<lane-id>/<component-id>/
   *  - /?lane=<lane-id>/<component-id>?scope=<scope>
   *  - /?lane=<lane-id>/<component-id>/~sub-route
   *  - /?lane=<lane-id>/<component-id>/~sub-route/another-sub-route
   *  - /?lane=<lane-id>/<component-id>/~sub-route?version=<version>
   *  - /?lane=<lane-id>/<component-id>/~sub-route?scope=<scope>
   *
   * 4. viewing currently checked out lane component on workspace
   *
   *  - /<component-id-without-scope>/
   *  - /<component-id-without-scope>?scope=<scope>
   *
   * 5. viewing lane component from the same scope as the lane on a workspace
   *
   * - /~lane/<lane-id>/<component-id-without-scope>/
   *
   * @todo - move this logic to a util function
   */
  const isActive = React.useMemo(() => {
    if (!href || !location) return false;

    const scopeFromQueryParams = location.search.split('scope=')[1];

    const pathname = location.pathname.substring(1).split('?')[0];
    const compIdStr = component.id.toStringWithoutVersion();
    const compIdName = component.id.fullName;
    const componentScope = component.id.scope;
    const locationIncludesLaneId = location.pathname.includes(LanesModel.lanesPrefix);

    const sanitizedHref = (href.startsWith('/') ? href.substring(1) : href).split('?')[0];

    // if you are in a workspace, the componentId might not have a scopeId, if you are viewing
    // a component on the checked out lane
    const viewingCheckedOutLaneComp =
      lanesModel?.currentLane && lanesModel.currentLane.id.toString() === lanesModel?.viewedLane?.id.toString();

    if (
      !locationIncludesLaneId &&
      (lanesModel?.viewedLane?.id.isDefault() || viewingMainCompOnLane || viewingCheckedOutLaneComp)
    ) {
      // split out any sub routes if exist
      const compUrl = pathname.split('/~')[0];
      // may or may not contain scope
      const scopeUrl = scope.name ? `${scope.name.replace('.', '/')}/` : '';
      const compUrlWithoutScope = compUrl.replace(scopeUrl, '');
      return !scopeFromQueryParams
        ? sanitizedHref === compUrlWithoutScope
        : sanitizedHref === compUrl && componentScope === scopeFromQueryParams;
    }

    const laneCompUrlWithSubRoutes = pathname.split(LanesModel.baseLaneComponentRoute)[1] ?? '';

    const _laneCompUrl = laneCompUrlWithSubRoutes.split('/~')[0] ?? '';
    const laneCompUrl = _laneCompUrl.startsWith('/') ? _laneCompUrl.substring(1) : _laneCompUrl;

    /**
     * if the laneCompUrl doesn't have the scope as part of it and you are on a bare scope
     * attach the bare scope to the laneCompUrl and parse it as a ComponentID
     */
    const laneCompIdFromUrl =
      ComponentID.tryFromString(laneCompUrl) ??
      (scope.name ? ComponentID.tryFromString(`${scope.name}/${laneCompUrl}`) : undefined);

    // viewing lane component from the same scope as the lane on a workspace
    const laneAndCompFromSameScopeOnWs =
      !scope.name && lanesModel?.viewedLane?.id && component.id.scope === lanesModel?.viewedLane?.id.scope;

    if (laneAndCompFromSameScopeOnWs) {
      return !scopeFromQueryParams
        ? compIdName === laneCompUrl
        : compIdName === laneCompUrl && componentScope === scopeFromQueryParams;
    }

    if (!laneCompIdFromUrl) return false;

    return !scopeFromQueryParams
      ? laneCompIdFromUrl?.toString() === compIdStr || laneCompIdFromUrl.fullName === compIdName
      : laneCompIdFromUrl?.toString() === compIdStr ||
          (laneCompIdFromUrl.fullName === compIdName && componentScope === scopeFromQueryParams);
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
        <Tooltip className={styles.componentEnvTooltip} placement="top" content={envTooltip}>
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
