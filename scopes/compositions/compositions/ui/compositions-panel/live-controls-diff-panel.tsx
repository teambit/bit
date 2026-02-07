import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DiffControlsModel,
  useLiveControls,
  type ControlWithSource,
} from '@teambit/compositions.ui.composition-live-controls';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { Icon } from '@teambit/evangelist.elements.icon';
import { getInputComponent } from './live-control-input';

import styles from './live-controls-diff-panel.module.scss';

type PanelStatus = 'loading' | 'available' | 'empty';

export type LiveControlsDiffPanelProps = {
  resetKey?: string;
  baseChannel?: string;
  compareChannel?: string;
  showEmptyState?: boolean;
  onStatusChange?: (status: PanelStatus) => void;
};

export function LiveControlsDiffPanel({
  resetKey,
  baseChannel,
  compareChannel,
  showEmptyState = true,
  onStatusChange,
}: LiveControlsDiffPanelProps) {
  const lastResetKeyRef = useRef<string | null>(null);
  const [isWaitingForFreshData, setIsWaitingForFreshData] = useState(true);
  const currentKey = `${baseChannel || ''}-${compareChannel || ''}-${resetKey || ''}`;

  const model = useMemo(() => new DiffControlsModel(baseChannel, compareChannel), [baseChannel, compareChannel]);

  const allChannels = useMemo(() => {
    const channels = [model.baseChannel, model.compareChannel];
    if (!channels.includes('default')) channels.push('default');
    return [...new Set(channels)];
  }, [model.baseChannel, model.compareChannel]);

  const combined = useLiveControls(allChannels);

  useEffect(() => {
    if (lastResetKeyRef.current !== currentKey) {
      lastResetKeyRef.current = currentKey;
      setIsWaitingForFreshData(true);
      combined.setTimestamp(0);
    }
  }, [currentKey, combined]);

  const channelsReady = Boolean(baseChannel && compareChannel);
  const registryReady = combined.ready || model.isReady;
  const controls = model.controls;
  const hasControls = controls.length > 0;

  const prevRegistryReady = useRef(registryReady);
  useEffect(() => {
    if (registryReady && !prevRegistryReady.current && isWaitingForFreshData) {
      setIsWaitingForFreshData(false);
    }
    prevRegistryReady.current = registryReady;
  }, [registryReady, isWaitingForFreshData]);

  const status: PanelStatus = useMemo(() => {
    if (!channelsReady) return 'loading';
    if (isWaitingForFreshData) return 'loading';
    return hasControls ? 'available' : 'empty';
  }, [channelsReady, isWaitingForFreshData, hasControls]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const handleChange = useCallback(
    (control: ControlWithSource, value: any) => {
      model.updateControl(control.id, value, control.source);
    },
    [model]
  );

  if (status === 'loading') {
    return (
      <div className={styles.loader}>
        <LineSkeleton width="68px" />
        <LineSkeleton width="52px" />
        <LineSkeleton width="72px" />
      </div>
    );
  }

  if (status === 'empty') {
    if (!showEmptyState) return null;
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIconWrap}>
          <Icon of="scan-component" className={styles.emptyStateIcon} aria-hidden />
        </div>
        <div className={styles.emptyStateText}>
          <div className={styles.emptyStateTitle}>No live controls</div>
          <div className={styles.emptyStateSubtitle}>This composition does not expose live controls.</div>
        </div>
      </div>
    );
  }

  const commonControls = controls.filter((c) => c.source === 'common');
  const baseControls = controls.filter((c) => c.source === 'base');
  const compareControls = controls.filter((c) => c.source === 'compare');
  const hasBaseOrCompare = baseControls.length > 0 || compareControls.length > 0;

  const getControlValue = (control: ControlWithSource) => {
    return model.getValueForControl(control.id, control.source);
  };

  const renderControlList = (list: ControlWithSource[]) => (
    <ul className={styles.controlsList}>
      {list.map((control) => {
        const InputComponent = getInputComponent(control.input || 'text');
        const key = `${control.id}-${control.source}`;
        const value = getControlValue(control);
        return (
          <li key={key} className={styles.controlRow}>
            <div className={styles.controlMain}>
              <div className={styles.controlLabel}>
                <label htmlFor={`control-${key}`}>{control.label || control.id}</label>
              </div>
              <InputComponent
                id={`control-${key}`}
                value={value}
                onChange={(val: any) => handleChange(control, val)}
                meta={control}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={styles.container}>
      <div className={styles.columnsLayout}>
        {commonControls.length > 0 && (
          <div className={styles.column}>
            <div className={styles.columnHeader}>Common</div>
            {renderControlList(commonControls)}
          </div>
        )}
        {commonControls.length > 0 && hasBaseOrCompare && <div className={styles.columnDivider} />}
        {baseControls.length > 0 && (
          <div className={styles.column}>
            <div className={styles.columnHeader}>Base</div>
            {renderControlList(baseControls)}
          </div>
        )}
        {compareControls.length > 0 && (
          <div className={styles.column}>
            <div className={styles.columnHeader}>Compare</div>
            {renderControlList(compareControls)}
          </div>
        )}
      </div>
    </div>
  );
}
