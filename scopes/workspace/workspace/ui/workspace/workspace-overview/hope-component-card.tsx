import React, { useEffect, useRef, useState } from 'react';
import { Link } from '@teambit/base-react.navigation.link';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { LoadPreview } from '@teambit/workspace.ui.load-preview';
import { ComponentID } from '@teambit/component-id';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import type { ScopeID } from '@teambit/scopes.scope-id';
import { getComponentStatus } from './filter-utils';
import { getAccent } from './namespace-hues';
import { ChangedPill, BuildSpinner, BuildingPreview, QueuedPreview } from './card-overlays';
import styles from './hope-component-card.module.scss';

export type HopeComponentCardProps = {
  component: ComponentModel;
  componentDescriptor: ComponentDescriptor;
  scope?: { id: ScopeID; icon?: string; backgroundIconColor?: string };
  showPreview?: boolean;
};

export function HopeComponentCard({
  component,
  componentDescriptor,
  scope,
  showPreview: showPreviewProp,
}: HopeComponentCardProps) {
  const [shouldShowPreview, setShouldShowPreview] = useState(Boolean(showPreviewProp));
  const prevServerUrlRef = useRef(component.server?.url);

  useEffect(() => {
    if (prevServerUrlRef.current !== component.server?.url && shouldShowPreview) {
      setShouldShowPreview(false);
      setTimeout(() => setShouldShowPreview(true), 50);
    }
    prevServerUrlRef.current = component.server?.url;
  }, [component.server?.url]);

  useEffect(() => {
    setShouldShowPreview(Boolean(showPreviewProp));
  }, [showPreviewProp]);

  const item = { component } as any;
  const status = getComponentStatus(item);
  const ns = component.id.namespace || '/';
  const accent = getAccent(ns);

  const isBuilding = status === 'building';
  const isQueued = status === 'queued';
  const isChanged = status === 'changed';

  const href = `${component.id.fullName}?scope=${component.id.scope}`;

  const loadPreviewVisible =
    component.compositions.length > 0 && component.buildStatus !== 'pending' && !shouldShowPreview;

  const showPreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShouldShowPreview(true);
  };

  const envAspect = componentDescriptor.get<any>('teambit.envs/envs');
  const env = envAspect?.data || envAspect;
  const envComponentId = env?.id ? ComponentID.fromString(env.id) : undefined;

  const cardClass = isBuilding ? styles.cardBuilding : styles.card;
  const buildingBorderStyle = isBuilding ? { borderColor: accent, boxShadow: `0 0 0 3px ${accent}1A` } : undefined;

  const nameLabel = component.id.namespace ? `${component.id.namespace}/${component.id.name}` : component.id.name;

  const shortHash = component.id.version?.slice(0, 7);

  const scopeInitial = component.id.scope?.split('.').pop()?.charAt(0).toUpperCase();

  return (
    <div className={cardClass} style={buildingBorderStyle}>
      {loadPreviewVisible && <LoadPreview className={styles.loadPreview} onClick={showPreviewClick} />}

      <Link href={href} className={styles.linkWrapper}>
        <div className={isQueued ? styles.previewQueued : styles.preview}>
          <div className={styles.previewInner}>
            <CardPreview
              component={component}
              componentDescriptor={componentDescriptor}
              status={status}
              accent={accent}
              shouldShowPreview={shouldShowPreview}
            />
          </div>

          {!isQueued && env?.icon && (
            <div className={styles.envBadge}>
              <Tooltip delay={300} content={envComponentId?.name}>
                <img src={env.icon} className={styles.envIcon} alt="" />
              </Tooltip>
            </div>
          )}

          {(isChanged || isBuilding) && (
            <div className={styles.statusCorner}>
              {isChanged && <ChangedPill />}
              {isBuilding && <BuildSpinner accent={accent} />}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Tooltip delay={300} content={component.id.scope}>
            <div className={styles.scopeBadge} style={{ background: scope?.backgroundIconColor || accent }}>
              {scope?.icon ? (
                <img src={scope.icon} className={styles.scopeBadgeIcon} alt="" />
              ) : (
                <span className={styles.scopeBadgeInitial}>{scopeInitial}</span>
              )}
            </div>
          </Tooltip>
          <span className={isQueued ? styles.nameQueued : styles.name}>{nameLabel}</span>
          {!isBuilding && !isQueued && shortHash && <span className={styles.hash}>{shortHash}</span>}
          {isBuilding && (
            <span className={styles.buildingLabel} style={{ color: accent }}>
              BUILDING
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

function CardPreview({
  component,
  componentDescriptor,
  status,
  accent,
  shouldShowPreview,
}: {
  component: ComponentModel;
  componentDescriptor: ComponentDescriptor;
  status: string;
  accent: string;
  shouldShowPreview: boolean;
}) {
  if (status === 'queued') return <QueuedPreview accent={accent} />;
  if (status === 'building') return <BuildingPreview accent={accent} />;

  return (
    <PreviewPlaceholder
      component={component}
      componentDescriptor={componentDescriptor}
      shouldShowPreview={shouldShowPreview}
    />
  );
}
