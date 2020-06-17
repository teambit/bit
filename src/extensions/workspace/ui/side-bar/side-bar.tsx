import React from 'react';

export function SideBar({ components }: any) {
  return (
    <ul>
      {components.map(component => (
        <li key={component.id}>{component.id}</li>
      ))}
    </ul>
  );
}
