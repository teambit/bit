// TODO: replace this with a better-implemented live control component set

import React from 'react';

import { InputText } from '@teambit/design.inputs.input-text';
import { TextArea } from '@teambit/design.inputs.text-area';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { MenuItem } from '@teambit/design.inputs.selectors.menu-item';
import { ColorPicker } from '@teambit/design.ui.input.color-picker';
import { DatePicker } from '@teambit/design.inputs.date-picker';
import { Toggle } from '@teambit/design.inputs.toggle-switch';

type InputComponentProps = {
  id: string;
  value: any;
  onChange: (value: any) => void;
  meta?: any;
};

type InputComponent = React.FC<InputComponentProps>;

function ShortTextInput({ id, value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setInputValue(newValue);
  };
  return <InputText id={id} value={inputValue} onChange={handleChange} />;
}

function LongTextInput({ id, value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setInputValue(newValue);
  };
  return <TextArea id={id} value={inputValue} onChange={handleChange} />;
}

function SelectInput({ id, value, onChange, meta }: InputComponentProps) {
  const [selectedValue, setSelectedValue] = React.useState(value);
  const handleChange = (newValue: any) => {
    onChange(newValue);
    setSelectedValue(newValue);
  };
  const placeholderContent = meta.options.find((o: any) => o.value === selectedValue)?.label;
  return (
    <Dropdown id={id} placeholderContent={placeholderContent}>
      {meta.options.map((option: any) => (
        <MenuItem active={option.value === selectedValue} key={option.value} onClick={() => handleChange(option.value)}>
          {option.label}
        </MenuItem>
      ))}
    </Dropdown>
  );
}

function NumberInput({ id, value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!isNaN(Number(newValue))) {
      onChange(Number(newValue));
      setInputValue(Number(newValue));
    } else {
      // TODO: render error message
      // eslint-disable-next-line no-console
      console.error('Invalid number input', newValue);
    }
  };
  return <InputText id={id} type="number" value={inputValue} onChange={handleChange} />;
}

function ColorInput({ id, value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const handleChange = (newValue: string) => {
    onChange(newValue);
    setInputValue(newValue);
  };
  return <ColorPicker id={id} value={inputValue} onColorSelect={handleChange} />;
}

function DateInput({ id, value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState<Date | null>(new Date(value));
  const handleChange = (newValue: Date | null) => {
    if (newValue) {
      onChange(newValue.toISOString().split('T')[0]);
    }
    setInputValue(newValue);
  };
  return <DatePicker id={id} date={inputValue} onChange={handleChange} />;
}

function ToggleInput({ id, value, onChange }: InputComponentProps) {
  const [isChecked, setIsChecked] = React.useState(value);
  const handleChange = () => {
    setIsChecked(!isChecked);
    onChange(!isChecked);
  };
  return <Toggle id={id} defaultChecked={isChecked} onChange={handleChange} />;
}

function JsonInput({ id, value, onChange }: InputComponentProps) {
  const [inputValue, setInputValue] = React.useState(JSON.stringify(value, null, 2));
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    try {
      const parsedValue = JSON.parse(newValue);
      onChange(parsedValue);
    } catch (error) {
      // TODO: render error message
      // eslint-disable-next-line no-console
      console.error('Invalid JSON input', newValue);
      // eslint-disable-next-line no-console
      console.error(error);
    }
    setInputValue(newValue);
  };
  return <TextArea id={id} value={inputValue} onChange={handleChange} />;
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
