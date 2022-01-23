import { useContext } from 'react';
import { TreeContext } from './tree-context';

export const useTree = () => useContext(TreeContext);
