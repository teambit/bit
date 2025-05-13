import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import React, { useCallback, useEffect, useState } from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useNavigate, useLocation } from '@teambit/base-react.navigation.link';
import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';

export type SelectOption =
  | string
  | {
      label: string;
      value: string;
    };

export type ControlBase = {
  id: string;
  input: any;
  label?: string;
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

export type InputProps = {
  id: string;
  value: any;
  onChange: (v: any) => void;
  info: Control;
};

function InputText(inputProps: InputProps) {
  const { id, value, onChange } = inputProps;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return <input id={id} type="text" value={value} onChange={handleChange} />;
}

function InputNumber(inputProps: InputProps) {
  const { id, value, onChange } = inputProps;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  return <input id={id} type="number" value={value} onChange={handleChange} />;
}

function InputBoolean(inputProps: InputProps) {
  const { id, value, onChange } = inputProps;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };
  return <input id={id} type="checkbox" checked={value} onChange={handleChange} />;
}

export function getInputType(field: Control): React.ComponentType<InputProps> {
  // TODO: implement this function
  field;
  switch (field.input) {
    case 'text':
      return InputText;
    case 'number':
      return InputNumber;
    case 'boolean':
      return InputBoolean;
    default:
      return InputText;
  }
}

export type CompositionsPanelProps = {
  /**
   * list of compositions
   */
  compositions: Composition[];
  /**
   * select composition to display
   */
  onSelectComposition: (composition: Composition) => void;
  /**
   * the currently active composition
   */
  active?: Composition;
  /**
   * the url to the base composition. doesntc contain the current composition params
   */
  url: string;
  /**
   * checks if a component is using the new preview api. if false, doesnt scale to support new preview
   */
  isScaling?: boolean;

  includesEnvTemplate?: boolean;

  useNameParam?: boolean;
} & React.HTMLAttributes<HTMLUListElement>;

export function CompositionsPanel({
  url,
  compositions,
  isScaling,
  onSelectComposition: onSelect,
  active,
  includesEnvTemplate,
  useNameParam,
  className,
  ...rest
}: CompositionsPanelProps) {
  const shouldAddNameParam = useNameParam || (isScaling && includesEnvTemplate === false);

  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
    },
    [onSelect]
  );

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const versionFromQueryParams = searchParams.get('version');
  const navigate = useNavigate();

  const [controlsTimestamp, setControlsTimestamp] = useState(0);
  const [controlsDef, setControlsDef] = useState<any>(null);
  const [consolesValues, setConsolesValues] = useState<any>({});
  const [mounter, setMounter] = useState<Window>();

  useEffect(() => {
    function handleCompositionControlsInit(e: MessageEvent) {
      if (!e.data || e.data.type !== 'composition-controls:ready') return () => {};
      // eslint-disable-next-line no-console
      console.log('handleCompositionControlsInit', JSON.stringify(e.data, null, 2));
      const { controls, values, timestamp } = e.data.payload;
      const iframeWindow = e.source;
      setMounter(iframeWindow as Window);
      setControlsDef(controls);
      setConsolesValues(values);
      setControlsTimestamp(timestamp);
    }
    window.addEventListener('message', handleCompositionControlsInit);
    return () => {
      window.removeEventListener('message', handleCompositionControlsInit);
    };
  }, []);

  const consolesUpdate = useCallback(
    (key: string, value: any) => {
      if (mounter) {
        mounter.postMessage({
          type: 'composition-controls:update',
          payload: { key, value, timestamp: controlsTimestamp },
        });
      }
      setConsolesValues((prev: any) => ({ ...prev, [key]: value }));
    },
    [mounter, consolesValues, controlsTimestamp]
  );

  const onCompositionCodeClicked = useCallback(
    (composition: Composition) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setControlsTimestamp(0);
      const queryParams = new URLSearchParams();
      if (versionFromQueryParams) {
        queryParams.set('version', versionFromQueryParams);
      }
      const basePath = location?.pathname.split('/~compositions')[0];
      navigate(`${basePath}/~code/${composition.filepath}?${queryParams.toString()}#search=${composition.identifier}`);
    },
    [location?.pathname, versionFromQueryParams]
  );

  return (
    <div>
      <ul {...rest} className={classNames(className)}>
        {compositions.map((composition) => {
          const href = shouldAddNameParam
            ? `${url}&name=${composition.identifier}`
            : `${url}&${composition.identifier}`;
          return (
            <li
              key={composition.identifier}
              className={classNames(styles.linkWrapper, composition === active && styles.active)}
            >
              <a className={styles.panelLink} onClick={() => handleSelect(composition)}>
                <span className={styles.box}></span>
                <span className={styles.name}>{composition.displayName}</span>
              </a>
              <div className={styles.right}>
                <MenuWidgetIcon
                  className={styles.codeLink}
                  icon="Code"
                  tooltipContent="Code"
                  onClick={onCompositionCodeClicked(composition)}
                />
                <Tooltip content="Open in new tab" placement="bottom">
                  <a className={styles.panelLink} target="_blank" rel="noopener noreferrer" href={href}>
                    <Icon className={styles.icon} of="open-tab" />
                  </a>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>
      {controlsTimestamp && (
        <div>
          <div>Controls</div>
          <div>
            {controlsDef.map((field) => {
              const key = field.id;
              const Input = getInputType(field);
              return (
                <div key={key}>
                  <div>
                    <label htmlFor={`control-${key}`}>{field.label || field.id}</label>
                  </div>
                  <div>
                    <Input
                      id={`control-${key}`}
                      value={consolesValues[key]}
                      onChange={(v: any) => consolesUpdate(key, v)}
                      info={field}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
