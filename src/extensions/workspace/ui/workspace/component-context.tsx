import { createContext } from 'react';
import { Component } from '../../../component/component.ui';
import { defaultComponent } from './default-component';

export const ComponentContext = createContext<Component>(defaultComponent);
