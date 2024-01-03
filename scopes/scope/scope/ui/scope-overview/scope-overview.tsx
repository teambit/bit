import React, { useContext, ComponentType } from 'react';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { ScopeDetails } from '@teambit/scope.ui.scope-details';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { EmptyScope } from '@teambit/scope.ui.empty-scope';
import { ComponentModel } from '@teambit/component';
import { ScopeContext } from '@teambit/scope.ui.hooks.scope-context';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import styles from './scope-overview.module.scss';
import type { ScopeBadgeSlot, OverviewLineSlot } from '../../scope.ui.runtime';

export type ScopeOverviewProps = {
  badgeSlot: ScopeBadgeSlot;
  overviewSlot: OverviewLineSlot;
  TargetOverview?: ComponentType;
};

export function ScopeOverview({ badgeSlot, overviewSlot, TargetOverview }: ScopeOverviewProps) {
  const scope = useContext(ScopeContext);
  const { components, componentDescriptors } = scope;
  if (TargetOverview) return <TargetOverview />;
  if (!components || components.length === 0) return <EmptyScope name={scope.name} />;
  const compDescriptorById = new Map(componentDescriptors.map((comp) => [comp.id.toString(), comp]));

  return (
    <div className={styles.container}>
      <ScopeDetails
        scopeName={scope.name}
        icon={scope.icon}
        backgroundIconColor={scope.backgroundIconColor}
        badgeSlot={badgeSlot}
        overviewSlot={overviewSlot}
        description={scope.description}
        componentCount={scope.components.length}
      />
      <ComponentGrid className={styles.cardGrid}>
        {components.map((component, index) => {
          if (component.deprecation?.isDeprecate) return null;
          return (
            <div key={index}>
              <ScopeComponentCard
                component={component}
                componentDescriptor={compDescriptorById.get(component.id.toString())}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}

type ScopeComponentCardProps = {
  component: ComponentModel;
  componentDescriptor?: ComponentDescriptor;
  componentUrl?: string;
};

export function ScopeComponentCard({ component, componentDescriptor, componentUrl }: ScopeComponentCardProps) {
  const shouldShowPreview = component.compositions.length > 0;

  return (
    <ComponentCard
      id={component.id.fullName}
      envIcon={component.environment?.icon}
      description={component.description}
      version={component.version}
      href={componentUrl}
      preview={
        <PreviewPlaceholder
          componentDescriptor={componentDescriptor}
          component={component}
          shouldShowPreview={shouldShowPreview}
        />
      }
    />
  );
}
