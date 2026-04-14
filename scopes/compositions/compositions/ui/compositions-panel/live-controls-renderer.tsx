import React from 'react';
import { LiveControls } from './live-control-panel';
import { useLiveControls } from '@teambit/compositions.ui.composition-live-controls';

export function LiveControlsRenderer() {
  const { hasLiveControls, ready, defs, values, onChange } = useLiveControls();

  if (!hasLiveControls) return null;

  if (!ready) {
    return <div style={{ padding: 12, opacity: 0.7 }}>No live controls available.</div>;
  }

  return <LiveControls defs={defs} values={values} onChange={onChange} />;
}
