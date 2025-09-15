/* eslint-disable no-console */

import React from 'react';
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

function SelectInput({ value, onChange, meta }: InputComponentProps) {
  const [selectedValue, setSelectedValue] = React.useState(value || '');

  React.useEffect(() => {
    setSelectedValue(value || '');
  }, [value]);

  const handleChange = (newValue: any) => {
    onChange(newValue || '');
    setSelectedValue(newValue || '');
  };

  const options: {
    label: string;
    value: string;
  }[] = React.useMemo(() => {
    if (!meta || !meta.options) return [];
    return meta.options.map((option: SelectOption) => {
      if (typeof option === 'string') {
        return { label: option, value: option };
      }
      return option;
    });
  }, [meta]);

  const placeholderContent = options.find((o) => o.value === selectedValue)?.label;

  return (
    <p className={classNames(styles.wrapper)}>
      <Dropdown placeholderContent={placeholderContent}>
        {options.map((option) => {
          return (
            <MenuItem
              active={option.value === selectedValue}
              key={option.value}
              onClick={() => handleChange(option.value)}
            >
              {option.label}
            </MenuItem>
          );
        })}
      </Dropdown>
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
