import React from 'react';
import testRenderer from 'react-test-renderer';
import { render } from '@testing-library/react';
import {
  YearsAgoWithTimestamp,
  MonthTimeAgo,
  MonthsTimeAgo,
  HourTimeAgo,
  HoursTimeAgo,
  CurrentTime,
  CurrentTimeWithIsoDate,
} from './time-ago.composition';

describe('Time Ago Component', () => {
  it('renders correctly', () => {
    testRenderer.create(<YearsAgoWithTimestamp />);
  });
  it('should render - years ago', () => {
    const { getByText } = render(<YearsAgoWithTimestamp />);
    const text = getByText(/years ago/);
    expect(text).toBeInTheDocument();
  });
});
