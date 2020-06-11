import React from 'react';
import { Component } from '../component';

export type MenuProps = {
  components: Component[];
  onClick: (id: Component) => void;
};

export function ComponentMenu({ components, onClick }: MenuProps) {
  if (!components) return <div>hi there</div>;
  return (
    <ul>
      {components.map((component, key) => (
        <li key={key} onClick={() => onClick(component)}>
          {component.id}
        </li>
      ))}
    </ul>
  );
}
