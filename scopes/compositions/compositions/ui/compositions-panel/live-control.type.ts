// TODO: remove this file after the CR below is merged
// https://bit.cloud/teambit/react.mounter/~change-requests/preview-control-20250515-2

export type ControlInputType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'range'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'color'
  | 'json'
  | 'custom';

export type SelectOption =
  | string
  | {
      label: string;
      value: string;
    };

export type ControlBase = {
  id: string;
  input?: string;
  defaultValue?: any;
  label?: string;
  type?: any;
};

export type ControlUnknown = {
  defaultValue?: any;
};

export type ControlBoolean = {
  input: 'boolean'; // <input type="checkbox">
  defaultValue?: boolean;
};

export type ControlSelect = {
  input: 'select'; // <select>
  options: Array<SelectOption>;
  defaultValue?: string;
  inline?: boolean; // <input type="radio"> x n
};

export type ControlMultiSelect = {
  input: 'multiselect'; // <select multiple>
  options: Array<SelectOption>;
  defaultValue?: Array<string>;
  inline?: boolean; // <input type="checkbox"> x n
};

export type ControlText = {
  input: 'text'; // <input type="text">
  defaultValue?: string;
};

export type ControlLongText = {
  input: 'longtext'; // <textarea>
  defaultValue?: string;
};

export type ControlNumber = {
  input: 'number'; // <input type="number">
  defaultValue?: number;
};

export type ControlRange = {
  input: 'range'; // <input type="range">
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
};

export type ControlDate = {
  input: 'date'; // <input type="date">
  defaultValue?: string;
};

export type ControlJSON = {
  input: 'json'; // <textarea>
  defaultValue?: any;
};

export type ControlColor = {
  input: 'color'; // <input type="color">
  defaultValue?: string;
};

export type ControlCustom<RenderFn = any, ValueType = any> = {
  input: 'custom';
  defaultValue?: ValueType;
  render: RenderFn;
  renderOptions?: Record<string, any>;
};

export type Control = ControlBase &
  (
    | ControlBoolean
    | ControlSelect
    | ControlMultiSelect
    | ControlText
    | ControlLongText
    | ControlNumber
    | ControlRange
    | ControlDate
    | ControlJSON
    | ControlColor
    | ControlCustom
    | ControlUnknown
  );

export type Controls = Array<Control> | Record<string, Omit<Control, 'id'>>;

function resolveControlMap(controls: Controls): Control[] {
  if (Array.isArray(controls)) {
    return controls;
  }
  if (typeof controls === 'object') {
    return Object.keys(controls).map((key) => ({
      ...controls[key],
      id: key,
    }));
  }
  return [];
}

function resolveControlInput(control: Control): Control {
  const { type } = control;
  let newInput = control.input;
  if (!newInput) {
    if (type === Boolean) {
      newInput = 'boolean';
    } else if (type === String) {
      newInput = 'text';
    } else if (type === Number) {
      newInput = 'number';
    } else if (type === Date) {
      newInput = 'date';
    } else if (type === Object) {
      newInput = 'json';
    } else {
      newInput = 'text';
    }
  }
  return { ...control, input: newInput };
}

/**
 * Controls can be an array or a map.
 * This function is designed to resolve controls into array.
 */
export function resolveControls(controls: Controls): Control[] {
  return resolveControlMap(controls).map(resolveControlInput);
}

function getTypeFromValue(value: any): any {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return String;
  }
  if (typeof value === 'number') {
    return Number;
  }
  if (typeof value === 'boolean') {
    return Boolean;
  }
  if (value instanceof Date) {
    return Date;
  }
  if (Array.isArray(value)) {
    return Array;
  }
  if (typeof value === 'object') {
    return Object;
  }
  return String;
}

export function resolveControlsFromValues(values: Record<string, any>): Control[] {
  return Object.keys(values).map((key) => {
    const control: Control = {
      id: key,
      input: 'unknown',
      type: getTypeFromValue(values[key]),
    };
    return resolveControlInput(control);
  });
}

/**
 * Applies default values from controls to props.
 */
export function resolveValues(values: Record<string, any>, controls: Control[]): Record<string, any> {
  const initValue: Record<string, any> = {};
  controls.forEach((control) => {
    const { id, defaultValue } = control;
    if (id in values) {
      initValue[id] = values[id];
    } else {
      initValue[id] = defaultValue;
    }
  });
  return initValue;
}

export const BROADCAST_READY_KEY = 'composition-live-controls:ready';

export const BROADCAST_UPDATE_KEY = 'composition-live-controls:update';

export const BROADCAST_DESTROY_KEY = 'composition-live-controls:destroy';

export function broadcastReady(target: Window, id: number, controls: Control[], values: Record<string, any>) {
  target.postMessage({
    type: BROADCAST_READY_KEY,
    payload: JSON.parse(
      JSON.stringify({
        timestamp: id,
        controls,
        values,
      })
    ),
  });
}

export function broadcastUpdate(target: Window, id: number, values: Record<string, any>) {
  target.postMessage({
    type: BROADCAST_UPDATE_KEY,
    payload: JSON.parse(
      JSON.stringify({
        timestamp: id,
        values,
      })
    ),
  });
}

export function broadcastDestroy(target: Window, id: number) {
  target.postMessage({
    type: BROADCAST_DESTROY_KEY,
    payload: JSON.parse(
      JSON.stringify({
        timestamp: id,
      })
    ),
  });
}

export type LiveControlReadyEventData = {
  type: 'composition-live-controls:ready';
  payload: {
    controls: Array<Control>;
    values: Record<string, any>;
    timestamp: number;
  };
};

export type LiveControlUpdateEventData = {
  type: 'composition-live-controls:update';
  payload: {
    key: string;
    value: any;
    timestamp: number;
  };
};

export type LiveControlDestroyEventData = {
  type: 'composition-live-controls:destroy';
  payload: {
    timestamp: number;
  };
};

export type LiveControlEventData = LiveControlUpdateEventData | LiveControlReadyEventData | LiveControlDestroyEventData;

export function getReadyListener(
  event: MessageEvent<LiveControlReadyEventData>,
  callback: (data: { controls: Control[]; values: Record<string, any>; timestamp: number }) => void
) {
  if (!event.data || event.data.type !== BROADCAST_READY_KEY) return;
  callback(JSON.parse(JSON.stringify(event.data.payload)));
}

export function getUpdateListener(
  event: MessageEvent<LiveControlUpdateEventData>,
  callback: (data: { key: string; value: any; timestamp: number }) => void
) {
  if (!event.data || event.data.type !== BROADCAST_UPDATE_KEY) return;
  callback(JSON.parse(JSON.stringify(event.data.payload)));
}

export function getDestroyListener(
  event: MessageEvent<LiveControlDestroyEventData>,
  callback: (data: { timestamp: number }) => void
) {
  if (!event.data || event.data.type !== BROADCAST_DESTROY_KEY) return;
  callback(JSON.parse(JSON.stringify(event.data.payload)));
}

export type LiveComposition<Component = any, RenderResult = any> = {
  live?: boolean;
  Comp: Component;
  props: Record<string, any>;
  controls?: Controls;
  render?: (args: Record<string, any>, Comp: Component) => RenderResult;
};

export type LivePreviewProps<T = React.ComponentType, N = React.ReactNode> = LiveComposition<T, N>;

export type ReactLiveComposition = LivePreviewProps;
