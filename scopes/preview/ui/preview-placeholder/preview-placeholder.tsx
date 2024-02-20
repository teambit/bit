import React, { useMemo, ComponentType, ReactNode } from 'react';
import { CompositionsAspect, ComponentComposition, Composition } from '@teambit/compositions';
import { H3, H5 } from '@teambit/design.ui.heading';
import { capitalize } from '@teambit/toolbox.string.capitalize';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ComponentModel } from '@teambit/component';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import DocsAspect from '@teambit/docs';

import styles from './preview-placeholder.module.scss';

export function getCompositions(component: ComponentDescriptor) {
  const entry: any = component.get(CompositionsAspect.id);
  if (!entry) return [];
  const compositions = entry.data.compositions;
  if (!compositions) return [];

  return Composition.fromArray(compositions);
}

export function getDisplayName(component: ComponentDescriptor) {
  const tokens = component.id.name.split('-').map((token) => capitalize(token));
  return tokens.join(' ');
}

function getDocsProperty(component: ComponentDescriptor, name: string) {
  const docs = component.get<any>(DocsAspect.id)?.data || {};
  if (!docs || !docs?.doc?.props) return undefined;
  const docProps = docs.doc.props;
  return docProps.find((prop) => prop.name === name);
}

export function getDescription(component: ComponentDescriptor) {
  const descriptionItem = getDocsProperty(component, 'description');
  if (!descriptionItem) return '';
  return descriptionItem.value || '';
}

export function PreviewPlaceholder({
  component,
  componentDescriptor,
  Container = ({ children, className }) => <div className={className}>{children}</div>,
  shouldShowPreview = (component?.compositions.length ?? 0) > 0 && component?.buildStatus !== 'pending',
}: {
  component?: ComponentModel;
  componentDescriptor?: ComponentDescriptor;
  Container?: ComponentType<{ component: any; children: ReactNode; className: string }>;
  shouldShowPreview?: boolean;
}) {
  const compositions = component?.compositions;
  const description = componentDescriptor && getDescription(componentDescriptor);
  const displayName = componentDescriptor && getDisplayName(componentDescriptor);

  const selectedPreview = useMemo(() => {
    if (!shouldShowPreview || !component) return undefined;
    return selectDefaultComposition(component);
  }, [component, shouldShowPreview]);

  if (!component || !componentDescriptor) return null;

  if (!shouldShowPreview || !compositions || !compositions.length) {
    return (
      <Container className={styles.noPreview} component={component}>
        <div className={styles.scope}>
          <H5 className={styles.scopeTitle}>{component.id.scope}</H5>
        </div>
        <div className={styles.component}>
          <H3 className={styles.componentTitle}>{displayName}</H3>
          <span className={styles.description}>{description}</span>
        </div>
      </Container>
    );
  }
  const name = component.id.toString();

  if (component.buildStatus === 'pending')
    return (
      <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
        <Icon of="Ripple-processing" />
        <div>Processing preview</div>
      </div>
    );

  return (
    <>
      <ComponentComposition component={component} composition={selectedPreview} pubsub={false} />
      <div className={styles.previewOverlay} />
    </>
  );
}

const PREVIEW_COMPOSITION_SUFFIX = 'Preview';

function selectDefaultComposition(component: ComponentModel) {
  const { compositions } = component;

  return compositions.find((x) => x.identifier.endsWith(PREVIEW_COMPOSITION_SUFFIX));
}
