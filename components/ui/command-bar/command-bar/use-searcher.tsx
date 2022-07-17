import { useEffect, useState } from 'react';
import useOptionalState from 'use-optionally-controlled-state';
import { useDebounce } from 'use-debounce';
import { useQueuedExecution, PromiseCanceledError } from '@teambit/base-react.hooks.use-queued-execution';
import { SearchResult } from '../search-result';

type UseSearcherOptions = {
  /** explicitly control the searched value */
  value?: string;
  /** initial value for the uncontrolled value */
  defaultValue?: string;
  /** max number of results of the search */
  limit?: number;
  /** delay term updates to reduce searches */
  debounce?: number;
};

export type Searcher = (term: string, limit: number) => SearchResults | Promise<SearchResults>;

export type SearchResults = {
  items: SearchResult[],
  data?: unknown
};

export function useSearcher(
  searcher: Searcher,
  { value: term, defaultValue = '', limit = 5, debounce = 0 }: UseSearcherOptions = {}
) {
  const [_value = defaultValue, setValue] = useOptionalState({
    controlledValue: term,
    initialValue: defaultValue,
  });

  const [state, setResults] = useState({ loading: false, items: [] as SearchResult[] });

  const [debouncedTerm] = useDebounce(_value, debounce); // reduce searches
  const queuedSearch = useQueuedExecution(searcher); // enforce order

  useEffect(() => {
    setResults((prevState) => ({ ...prevState, loading: true }));

    Promise.resolve(queuedSearch(debouncedTerm, limit))
      .then((result) => {
        setResults((prev) => ({ ...prev, items: result.items, data: result.data, loading: false }));
      })
      .catch((err: any) => {
        if (err instanceof PromiseCanceledError) return;
        throw err;
      });
  }, [debouncedTerm, limit, queuedSearch]);

  return { ...state, value: _value, onChange: setValue, defaultValue };
}
