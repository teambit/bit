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
  type?: string | Function; // e.g. 'string', 'number', 'boolean', Date, Object, etc.
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

// This utility type is used to omit a key from a type, but it distributes over union types.
// This is useful for ensuring that the type is correctly applied to each member of a union.
// It is similar to the built-in Omit type, but it works with union types.
type DistributiveOmit<T, K extends keyof T> = T extends any ? Omit<T, K> : never;

export type Controls = Array<Control> | Record<string, DistributiveOmit<Control, 'id'>>;

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
    if (typeof type === 'string') {
      switch (type) {
        case 'boolean':
          newInput = 'boolean';
          break;
        case 'string':
          newInput = 'text';
          break;
        case 'number':
          newInput = 'number';
          break;
        case 'date':
          newInput = 'date';
          break;
        case 'object':
          newInput = 'json';
          break;
        default:
          newInput = 'text';
      }
    } else if (typeof type === 'function') {
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

/**
 * Resolves controls from values.
 * It will return an array of controls based on the type of values in each key.
 */
export function resolveControlsFromValues(values: Record<string, any>): Control[] {
  return Object.keys(values).map((key) => {
    const control: Control = {
      id: key,
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

/**
 * Resolves all the data from given values and controls.
 */
export function resolveAll(values: Record<string, any>, controls: Controls): [Record<string, any>, Control[]] {
  const cs = controls ? resolveControls(controls) : resolveControlsFromValues(values);
  const vs = resolveValues(values, cs);
  return [vs, cs];
}

export const BROADCAST_READY_KEY = 'composition-live-controls:ready';

export const BROADCAST_UPDATE_KEY = 'composition-live-controls:update';

export const BROADCAST_DESTROY_KEY = 'composition-live-controls:destroy';

export function broadcastReady(
  target: Window,
  timestamp: number,
  controls: Control[],
  values: Record<string, any>,
  channel = 'default'
) {
  target.postMessage(
    {
      type: BROADCAST_READY_KEY,
      payload: JSON.parse(
        JSON.stringify({
          timestamp,
          controls,
          values,
          channel,
        })
      ),
    },
    '*'
  );
}

export function broadcastUpdate(
  target: Window,
  id: number,
  { key, value }: { key: string; value: any },
  channel = 'default'
) {
  target.postMessage(
    {
      type: BROADCAST_UPDATE_KEY,
      payload: JSON.parse(
        JSON.stringify({
          timestamp: id,
          key,
          value,
          channel,
        })
      ),
    },
    '*'
  );
}

export function broadcastDestroy(target: Window, id: number, channel = 'default') {
  target.postMessage(
    {
      type: BROADCAST_DESTROY_KEY,
      payload: JSON.parse(
        JSON.stringify({
          timestamp: id,
          channel,
        })
      ),
    },
    '*'
  );
}

export type LiveControlReadyEventData = {
  type: 'composition-live-controls:ready';
  payload: {
    timestamp: number;
    controls: Array<Control>;
    values: Record<string, any>;
    channel?: string;
  };
};

export type LiveControlUpdateEventData = {
  type: 'composition-live-controls:update';
  payload: {
    timestamp: number;
    key: string;
    value: any;
    channel?: string;
  };
};

export type LiveControlDestroyEventData = {
  type: 'composition-live-controls:destroy';
  payload: {
    timestamp: number;
    channel?: string;
  };
};

export type LiveControlEventData = LiveControlUpdateEventData | LiveControlReadyEventData | LiveControlDestroyEventData;

export function getReadyListener(
  event: MessageEvent<LiveControlReadyEventData>,
  callback: (data: { timestamp: number; controls: Control[]; values: Record<string, any>; channel?: string }) => void
) {
  if (!event.data || event.data.type !== BROADCAST_READY_KEY) return;
  callback(JSON.parse(JSON.stringify(event.data.payload)));
}

export function getUpdateListener(
  event: MessageEvent<LiveControlUpdateEventData>,
  callback: (data: { timestamp: number; key: string; value: any; channel?: string }) => void
) {
  if (!event.data || event.data.type !== BROADCAST_UPDATE_KEY) return;
  callback(JSON.parse(JSON.stringify(event.data.payload)));
}

export function getDestroyListener(
  event: MessageEvent<LiveControlDestroyEventData>,
  callback: (data: { timestamp: number; channel?: string }) => void
) {
  if (!event.data || event.data.type !== BROADCAST_DESTROY_KEY) return;
  callback(JSON.parse(JSON.stringify(event.data.payload)));
}

export type LiveComposition<Component = any, RenderResult = any> = {
  component: Component;
  props: Record<string, any>;
  controls?: Controls;
  render?: (args: Record<string, any>, Comp: Component) => RenderResult;
  noControls?: boolean;
};

export type ChannelName = string;
export type LiveControlsSubscriber = {
  iframeWindow: Window;
  timestamp: number;
};

// e.g. `http://localhost:3000/preview/bitdev.react/react-env@xxx/#teambit.vite/examples/foo?preview=compositions&env=bitdev.react/react-env@xxx&name=BasicFoo&fullscreen=true&livecontrols=true`
// e.g. `http://xxx.bit.cloud/api/bitdev.react/react-env@xxx/#teambit.vite/examples/foo?preview=compositions&env=bitdev.react/react-env@xxx&name=BasicFoo&fullscreen=true&livecontrols=true`
export function needLiveControls({ hash }: Location): boolean {
  const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
  return params.has('livecontrols') && params.get('livecontrols') === 'true';
}

export function getLiveControlsChannel(location: Location): string {
  const params = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1));
  return params.get('lcchannel') || 'default';
}
