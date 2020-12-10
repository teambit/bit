import React from 'react';
import testRenderer from 'react-test-renderer';
import { ServerErrorPageExample } from './server-error-page.composition';

describe('Server error page component', () => {
  it('should render correctly', () => {
    testRenderer.create(<ServerErrorPageExample />);
  });
});
