import React from 'react';
import { ComponentStatus } from './component-status';

export default function Overview() {
  return null;
}

Overview.abstract = 'A UI component that represents the current status of the component.';

Overview.labels = ['react', 'typescript', 'status'];

Overview.examples = [
  {
    scope: {
      ComponentStatus,
    },
    title: 'Error Component Status',
    description: 'Using the component with error status property',
    jsx: <ComponentStatus status="error" />,
  },
  {
    scope: {
      ComponentStatus,
    },
    title: 'Modified Component Status',
    description: 'Using the component with modified status property',
    jsx: <ComponentStatus status="modified" />,
  },
  {
    scope: {
      ComponentStatus,
    },
    title: 'New Component Status',
    description: 'Using the component with new status property',
    jsx: <ComponentStatus status="new" />,
  },
  {
    scope: {
      ComponentStatus,
    },
    title: 'Staged Component Status',
    description: 'Using the component with staged status property',
    jsx: <ComponentStatus status="staged" />,
  },
];
