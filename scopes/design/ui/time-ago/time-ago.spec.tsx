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
  it('renders correctly - years ago', () => {
    testRenderer.create(<YearsAgoWithTimestamp />);
  });
  it('should render - years ago', () => {
    const { getByText } = render(<YearsAgoWithTimestamp />);
    const text = getByText(/years ago/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
  it('renders correctly - month ago', () => {
    testRenderer.create(<MonthTimeAgo />);
  });
  it('should render - month ago', () => {
    const { getByText } = render(<MonthTimeAgo />);
    const text = getByText(/month ago/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
  it('renders correctly - months ago', () => {
    testRenderer.create(<MonthsTimeAgo />);
  });
  it('should render - months ago', () => {
    const { getByText } = render(<MonthsTimeAgo />);
    const text = getByText(/months ago/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
  it('renders correctly - hour ago', () => {
    testRenderer.create(<HourTimeAgo />);
  });
  it('should render - hour ago', () => {
    const { getByText } = render(<HourTimeAgo />);
    const text = getByText(/hour ago/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
  it('renders correctly - hours ago', () => {
    testRenderer.create(<HoursTimeAgo />);
  });
  it('should render - hours ago', () => {
    const { getByText } = render(<HoursTimeAgo />);
    const text = getByText(/hours ago/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
  it('renders correctly - just now', () => {
    testRenderer.create(<CurrentTime />);
  });
  it('should render - just now', () => {
    const { getByText } = render(<CurrentTime />);
    const text = getByText(/just now/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
  it('renders correctly - just now with ISO date', () => {
    testRenderer.create(<CurrentTimeWithIsoDate />);
  });
  it('should render - just now', () => {
    const { getByText } = render(<CurrentTimeWithIsoDate />);
    const text = getByText(/just now/);
    // @ts-ignore
    expect(text).toBeInTheDocument();
  });
});
