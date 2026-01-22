/* eslint-disable no-console */

import React from 'react';
import classNames from 'classnames';

import { InputText } from '@teambit/design.inputs.input-text';
import { TextArea } from '@teambit/design.inputs.text-area';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { MenuItem } from '@teambit/design.inputs.selectors.menu-item';
import { ColorPicker, ColorsBox } from '@teambit/design.ui.input.color-picker';
import { DatePicker } from '@teambit/design.inputs.date-picker';
import { Toggle } from '@teambit/design.inputs.toggle-switch';
import { useOverlay, BitPortal } from './use-overlay';

import styles from './live-control-input.module.scss';
import overlayStyles from './overlay.module.scss';

type InputComponentProps = {
  id: string;
  value: any;
  onChange: (value: any) => void;
  meta?: any;
};

type InputComponent = React.FC<InputComponentProps>;

function ShortTextInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value || '');

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue || '');
    setInputValue(newValue || '');
  };

  return <InputText value={inputValue} onChange={handleChange} />;
}

function LongTextInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value || '');

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue || '');
    setInputValue(newValue || '');
  };

  return <TextArea value={inputValue} onChange={handleChange} />;
}

function SelectInput({ value, onChange, meta }: InputComponentProps) {
  const [selectedValue, setSelectedValue] = React.useState(value || '');
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    setSelectedValue(value || '');
  }, [value]);

  const options = React.useMemo(() => {
    if (!meta?.options) return [];
    return meta.options.map((o: any) => (typeof o === 'string' ? { label: o, value: o } : o));
  }, [meta]);

  const placeholderContent = options.find((o) => o.value === selectedValue)?.label;

  const { position, style } = useOverlay(triggerRef, open);

  const commitSelection = (v: string) => {
    onChange(v);
    setSelectedValue(v);
    setOpen(false);
  };

  return (
    <p ref={triggerRef} className={classNames(styles.wrapper)}>
      <Dropdown
        placeholderContent={placeholderContent}
        open={open}
        onChange={(_, isOpen) => setOpen(isOpen)}
        position={position}
      />

      {open && style && (
        <BitPortal>
          <div className={overlayStyles.overlay} style={style} onMouseDown={(e) => e.stopPropagation()}>
            {options.map((option) => (
              <MenuItem
                className={styles.portalMenuItem}
                key={option.value}
                active={option.value === selectedValue}
                onClick={() => commitSelection(option.value)}
              >
                {option.label}
              </MenuItem>
            ))}
          </div>
        </BitPortal>
      )}
    </p>
  );
}

function NumberInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value || 0);

  React.useEffect(() => {
    setInputValue(value || 0);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!isNaN(Number(newValue))) {
      onChange(Number(newValue) || 0);
      setInputValue(Number(newValue) || 0);
    } else {
      // TODO: render error message
      // eslint-disable-next-line no-console
      console.error('Invalid number input', newValue);
    }
  };

  return <InputText type="number" value={inputValue} onChange={handleChange} />;
}

function ColorPickerPortal(props: any) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const { position, style } = useOverlay(triggerRef, open);

  return (
    <div ref={triggerRef}>
      <ColorPicker
        {...props}
        open={open}
        onChange={(_, isOpen) => setOpen(isOpen)}
        position={position}
        dropClass={overlayStyles.suppressNativeMenu}
      />

      {open && style && (
        <BitPortal>
          <div className={overlayStyles.overlay} style={style} onMouseDown={(e) => e.stopPropagation()}>
            <ColorsBox
              onColorSelect={(color: string) => {
                props.onColorSelect?.(color);
                setOpen(false);
              }}
              colorsList={props.colorsList}
              showNoColor={props.showNoColor}
              selected={props.value ?? ''}
            />
          </div>
        </BitPortal>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value || '');

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleChange = (v: string) => {
    onChange(v);
    setInputValue(v);
  };

  return (
    <p className={styles.wrapper}>
      <ColorPickerPortal value={inputValue} onColorSelect={handleChange} allowCustomColor />
    </p>
  );
}

function DateInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState<Date | null>(new Date(value));

  React.useEffect(() => {
    setInputValue(new Date(value));
  }, [value]);

  const handleChange = (newValue: Date | null) => {
    if (newValue) {
      onChange(newValue.toISOString().split('T')[0]);
    }
    setInputValue(newValue);
  };

  return (
    <p className={classNames(styles.wrapper)}>
      <DatePicker date={inputValue} onChange={handleChange} />
    </p>
  );
}

function ToggleInput({ value, onChange }: InputComponentProps) {
  const [isChecked, setIsChecked] = React.useState(!!value);

  React.useEffect(() => {
    setIsChecked(!!value);
  }, [value]);

  const handleChange = () => {
    setIsChecked(!isChecked);
    onChange(!isChecked);
  };

  return (
    <p className={classNames(styles.wrapper)}>
      <Toggle defaultChecked={isChecked} onChange={handleChange} />
    </p>
  );
}

function JsonInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(JSON.stringify(value, null, 2));

  React.useEffect(() => {
    setInputValue(JSON.stringify(value, null, 2));
  }, [value]);

  const [message, setMessage] = React.useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    try {
      const parsedValue = JSON.parse(newValue);
      onChange(parsedValue);
      setMessage('');
    } catch {
      setMessage('Invalid JSON');
    }
    setInputValue(newValue);
  };

  return (
    <div>
      <TextArea value={inputValue} onChange={handleChange} />
      {message && <div style={{ color: 'red' }}>{message}</div>}
    </div>
  );
}

export function getInputComponent(type: string): InputComponent {
  switch (type) {
    case 'text':
      return ShortTextInput;
    case 'longtext':
      return LongTextInput;
    case 'select':
      return SelectInput;
    case 'number':
      return NumberInput;
    case 'color':
      return ColorInput;
    case 'date':
      return DateInput;
    case 'boolean':
      return ToggleInput;
    case 'json':
      return JsonInput;
    default:
      // eslint-disable-next-line no-console
      console.warn(`Unknown input type: ${type}`);
      return ShortTextInput;
  }
}
