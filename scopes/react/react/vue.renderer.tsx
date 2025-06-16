// TODO: this file can be a dedicated component

import React from 'react';
import type { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import type { APINode } from '@teambit/api-reference.models.api-reference-model';
import { PropTable } from '@teambit/documenter.ui.property-table';
import type { RowType } from '@teambit/documenter.ui.table-row';
import type { ComponentMeta } from 'vue-component-meta';

import styles from './vue.renderer.module.scss';

function useMeta(apiNode: APINode): ComponentMeta {
  return (apiNode.api as any).meta as ComponentMeta;
}

function VueSFCProps({ props, expanded = false }: { props: ComponentMeta['props']; expanded?: boolean }) {
  const rows: RowType[] = props
    .filter(({ global }) => !global)
    .map(({ name, default: defaultValue, required, type, description }) => {
      const row: RowType = {
        name,
        required,
        type,
        description,
      };
      if (defaultValue) {
        row.default = { value: defaultValue };
      }
      return row;
    });
  if (rows.length === 0) {
    return (
      <div>
        <h2 className={styles.title}>Props</h2>
        <p className={styles.empty}>No props found.</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className={styles.title}>Props</h2>
      <PropTable rows={rows} showListView={expanded} listViewResolution={320} />
    </div>
  );
}

function VueSFCEmits({ events, expanded = false }: { events: ComponentMeta['events']; expanded?: boolean }) {
  const rows: RowType[] = events.map(({ name, type, description }) => ({
    name,
    required: false,
    type,
    description,
  }));
  if (rows.length === 0) {
    return null;
  }
  return (
    <div>
      <h2 className={styles.title}>Emits</h2>
      <PropTable rows={rows} showListView={expanded} listViewResolution={320} />
    </div>
  );
}

function VueSFCSlots({ slots, expanded }: { slots: ComponentMeta['slots']; expanded?: boolean }) {
  const rows: RowType[] = slots.map(({ name, type, description }) => ({
    name,
    required: false,
    type,
    description,
  }));
  if (rows.length === 0) {
    return null;
  }
  return (
    <div>
      <h2 className={styles.title}>Slots</h2>
      <PropTable rows={rows} showListView={expanded} listViewResolution={320} />
    </div>
  );
}

function VueComponent({ apiNode }: APINodeRenderProps) {
  const meta = useMeta(apiNode);
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <VueSFCProps props={meta.props} />
        <VueSFCEmits events={meta.events} />
        <VueSFCSlots slots={meta.slots} />
      </div>
    </div>
  );
}

function VueOverviewComponent({ apiNode }: APINodeRenderProps) {
  const meta = useMeta(apiNode);
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <VueSFCProps props={meta.props} />
        <VueSFCEmits events={meta.events} />
        <VueSFCSlots slots={meta.slots} />
      </div>
    </div>
  );
}

function predicate(node: any): boolean {
  return node.__schema === 'VueSchema';
}

export const vueRenderer: APINodeRenderer = {
  predicate,
  Component: VueComponent,
  OverviewComponent: VueOverviewComponent,
  nodeType: 'Vue SFCs',
  icon: { name: 'Vue', url: 'https://static.bit.dev/extensions-icons/vue.svg' },
  default: true,
};
