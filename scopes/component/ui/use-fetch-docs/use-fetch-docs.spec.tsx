import { renderHook, act } from '@testing-library/react-hooks';
import { useFetchDocs } from './use-fetch-docs';

it('should increment counter', () => {
  const { result } = renderHook(() => useFetchDocs());
  act(() => {
    result.current.increment();
  });
  expect(result.current.count).toBe(1);
});
