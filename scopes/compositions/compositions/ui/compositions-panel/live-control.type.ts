// TODO: put the whole file into a sharable Bit component for custom preview mounters

export type LiveControlUpdateEventData = {
  type: 'composition-live-controls:update';
  payload: {
    key: string;
    value: any;
    timestamp: number;
  };
};

export type LiveControlReadyEventData = {
  type: 'composition-live-controls:ready';
  payload: {
    controls: Array<Control>;
    values: Record<string, any>;
    timestamp: number;
  };
};

export type LiveControlEventData = LiveControlUpdateEventData | LiveControlReadyEventData;

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
    | ControlColor
    | ControlCustom
    | ControlUnknown
  );
