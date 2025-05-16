// TODO: put the whole file into a sharable Bit component for custom preview mounters

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
  defaultValue?: boolean;
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

export function resolveControls(controls: Controls): Control[] {
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

export function resolveValues(props: Record<string, any>, control: Control[]): Record<string, any> {
  const initValue: Record<string, any> = {};
  control.forEach((field) => {
    const { id, defaultValue } = field;
    if (id in props) {
      initValue[id] = props[id];
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

export type LiveComposition<ComponentType = any, RenderingResult = any> = {
  live: boolean;
  Comp: ComponentType;
  props: Record<string, any>;
  controls?: Array<Control> | Record<string, Omit<Control, 'id'>>;
  render?: (args: any, component: ComponentType) => RenderingResult;
};
