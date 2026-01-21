/* eslint-disable no-console */

import React from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';

import { InputText } from '@teambit/design.inputs.input-text';
import { TextArea } from '@teambit/design.inputs.text-area';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { MenuItem } from '@teambit/design.inputs.selectors.menu-item';
import { ColorPicker } from '@teambit/design.ui.input.color-picker';
import { DatePicker } from '@teambit/design.inputs.date-picker';
import { Toggle } from '@teambit/design.inputs.toggle-switch';

import { type SelectOption } from '@teambit/compositions.ui.composition-live-controls';

import styles from './live-control-input.module.scss';

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

export function SelectInput({ value, onChange, meta }: InputComponentProps) {
  const triggerRef = React.useRef<HTMLParagraphElement>(null);

  const [selectedValue, setSelectedValue] = React.useState(value || '');
  const [open, setOpen] = React.useState(false);
  const [portalMenuPosition, setPortalMenuPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  React.useEffect(() => {
    setSelectedValue(value || '');
  }, [value]);

  const options = React.useMemo<{ label: string; value: string }[]>(() => {
    if (!meta?.options) return [];
    return meta.options.map((option: SelectOption) =>
      typeof option === 'string' ? { label: option, value: option } : option
    );
  }, [meta]);

  const placeholderContent = options.find((o) => o.value === selectedValue)?.label;

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    setPortalMenuPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  const commitSelection = (newValue: any) => {
    const v = newValue || '';
    onChange(v);
    setSelectedValue(v);
    setOpen(false);
  };

  return (
    <p ref={triggerRef} className={classNames(styles.wrapper)}>
      <Dropdown placeholderContent={placeholderContent} open={open} onChange={(_, isOpen) => setOpen(isOpen)} />

      {open &&
        portalMenuPosition &&
        ReactDOM.createPortal(
          <div
            className={styles.portalMenu}
            style={{
              top: portalMenuPosition.top,
              left: portalMenuPosition.left,
              width: portalMenuPosition.width,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            {options.map((option) => (
              <MenuItem
                className={styles.portalMenuItem}
                key={option.value}
                active={option.value === selectedValue}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  commitSelection(option.value);
                }}
              >
                {option.label}
              </MenuItem>
            ))}
          </div>,
          document.body
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

function ColorInput({ value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value || '');

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleChange = (newValue: string) => {
    onChange(newValue || '');
    setInputValue(newValue || '');
  };

  return (
    <p className={classNames(styles.wrapper)}>
      <ColorPicker value={inputValue} onColorSelect={handleChange} allowCustomColor />
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
