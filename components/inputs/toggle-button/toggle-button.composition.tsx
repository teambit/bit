import React, { useState } from 'react';
import { Text } from '@teambit/design.typography.text';
import { ToggleButton } from './toggle-button';
import type { Option } from './toggle-button';

export function BasicToggleButton() {
  const options = [
    { value: 'One', element: 'One' },
    { value: 'Two', element: 'Two' },
  ];
  return <ToggleButton options={options} />;
}

export function MultipleToggleButton() {
  const options = [
    { value: 'One', element: 'One' },
    { value: 'Two', element: 'Two' },
    { value: 'Three', element: 'Three' },
    { value: 'Four', element: 'Four' },
    { value: 'Five', element: 'Five' },
  ];
  return <ToggleButton options={options} defaultIndex={2} />;
}

export function ToggleButtonWithCustomElements() {
  const [selectedOption, setSelectedOption] = useState(0);

  const options: Option[] = [
    {
      value: 'Public',
      element: <Text style={{ marginLeft: 5 }}>Public</Text>,
      icon: <EarthSvg fill={selectedOption === 0 ? '#2b2b2b' : '#707279'} />,
    },
    {
      value: 'Private',
      element: <Text style={{ marginLeft: 5 }}>Private</Text>,
      icon: <LockSvg fill={selectedOption === 1 ? '#2b2b2b' : '#707279'} />,
    },
  ];

  const onOptionSelect = (_selectedOption: number) => setSelectedOption(_selectedOption);

  return <ToggleButton options={options} defaultIndex={1} onOptionSelect={onOptionSelect} />;
}

function EarthSvg({ fill = '#707279' }: { fill?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21.41 8.64C21.41 8.64 21.41 8.64 21.41 8.59C20.7053 6.66623 19.4269 5.00529 17.7474 3.83187C16.068 2.65845 14.0687 2.02917 12.02 2.02917C9.9712 2.02917 7.97189 2.65845 6.29246 3.83187C4.61304 5.00529 3.33455 6.66623 2.62995 8.59C2.62995 8.59 2.62995 8.59 2.62995 8.64C1.84308 10.8109 1.84308 13.1891 2.62995 15.36C2.62995 15.36 2.62995 15.36 2.62995 15.41C3.33455 17.3338 4.61304 18.9947 6.29246 20.1681C7.97189 21.3416 9.9712 21.9708 12.02 21.9708C14.0687 21.9708 16.068 21.3416 17.7474 20.1681C19.4269 18.9947 20.7053 17.3338 21.41 15.41C21.41 15.41 21.41 15.41 21.41 15.36C22.1968 13.1891 22.1968 10.8109 21.41 8.64ZM4.25995 14C3.91318 12.6892 3.91318 11.3108 4.25995 10H6.11995C5.95998 11.3285 5.95998 12.6715 6.11995 14H4.25995ZM5.07995 16H6.47995C6.71467 16.8918 7.05016 17.7541 7.47995 18.57C6.49925 17.9019 5.67945 17.0241 5.07995 16ZM6.47995 8H5.07995C5.67082 6.97909 6.48014 6.10147 7.44995 5.43C7.03051 6.24725 6.70509 7.10942 6.47995 8ZM11 19.7C9.77172 18.7987 8.9091 17.4852 8.56995 16H11V19.7ZM11 14H8.13995C7.95334 12.6732 7.95334 11.3268 8.13995 10H11V14ZM11 8H8.56995C8.9091 6.51477 9.77172 5.20132 11 4.3V8ZM18.92 8H17.52C17.2852 7.10816 16.9497 6.24594 16.52 5.43C17.5007 6.09807 18.3205 6.97594 18.92 8ZM13 4.3C14.2282 5.20132 15.0908 6.51477 15.43 8H13V4.3ZM13 19.7V16H15.43C15.0908 17.4852 14.2282 18.7987 13 19.7ZM15.86 14H13V10H15.86C16.0466 11.3268 16.0466 12.6732 15.86 14ZM16.55 18.57C16.9797 17.7541 17.3152 16.8918 17.55 16H18.95C18.3505 17.0241 17.5307 17.9019 16.55 18.57ZM19.74 14H17.88C17.9613 13.3365 18.0014 12.6685 18 12C18.0011 11.3315 17.961 10.6636 17.88 10H19.74C20.0867 11.3108 20.0867 12.6892 19.74 14Z"
        fill={fill}
      />
    </svg>
  );
}

function LockSvg({ fill = '#707279' }: { fill?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17 9V7C17 5.67392 16.4732 4.40215 15.5355 3.46447C14.5979 2.52678 13.3261 2 12 2C10.6739 2 9.40215 2.52678 8.46447 3.46447C7.52678 4.40215 7 5.67392 7 7V9C6.20435 9 5.44129 9.31607 4.87868 9.87868C4.31607 10.4413 4 11.2044 4 12V19C4 19.7956 4.31607 20.5587 4.87868 21.1213C5.44129 21.6839 6.20435 22 7 22H17C17.7956 22 18.5587 21.6839 19.1213 21.1213C19.6839 20.5587 20 19.7956 20 19V12C20 11.2044 19.6839 10.4413 19.1213 9.87868C18.5587 9.31607 17.7956 9 17 9ZM9 7C9 6.20435 9.31607 5.44129 9.87868 4.87868C10.4413 4.31607 11.2044 4 12 4C12.7956 4 13.5587 4.31607 14.1213 4.87868C14.6839 5.44129 15 6.20435 15 7V9H9V7ZM18 19C18 19.2652 17.8946 19.5196 17.7071 19.7071C17.5196 19.8946 17.2652 20 17 20H7C6.73478 20 6.48043 19.8946 6.29289 19.7071C6.10536 19.5196 6 19.2652 6 19V12C6 11.7348 6.10536 11.4804 6.29289 11.2929C6.48043 11.1054 6.73478 11 7 11H17C17.2652 11 17.5196 11.1054 17.7071 11.2929C17.8946 11.4804 18 11.7348 18 12V19Z"
        fill={fill}
      />
    </svg>
  );
}
