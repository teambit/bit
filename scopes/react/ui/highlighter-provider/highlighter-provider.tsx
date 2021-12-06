import React, { useMemo, useState, useEffect, ReactNode, FC } from 'react';
import classnames from 'classnames';
import { ComponentHighlighter } from '@teambit/react.ui.component-highlighter';
import queryString from 'query-string';
import styles from './highlighter-provider.module.scss';

export const PARAM_NAME = 'highlighter';

export const HighlighterProvider: FC = ({ children }: { children?: ReactNode }) => {
  const hash = useHash();

  const isActive = useMemo(() => {
    const hashQuery = hash.split('?')[1];
    const query = queryString.parse(hashQuery);
    return query[PARAM_NAME] === 'true';
  }, [hash]);

  return (
    <ComponentHighlighter
      disabled={!isActive}
      className={classnames(styles.highlighter, isActive && styles.active)}
      size="s"
    >
      {children}
    </ComponentHighlighter>
  );
};

function useHash() {
  const [hash, setHash] = useState(window ? window.location.hash : '');

  useEffect(() => {
    const updateHash = () => {
      setHash(window.location.hash);
    };

    updateHash();
    window.addEventListener('hashchange', updateHash);

    return () => {
      window.removeEventListener('hashchange', updateHash);
    };
  }, []);

  return hash;
}
