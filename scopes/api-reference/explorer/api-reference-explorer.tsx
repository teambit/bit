import React, { HTMLAttributes, useState, useMemo, ComponentType } from 'react';
import classNames from 'classnames';
import { APINodeRendererSlot } from '@teambit/api-reference';

import styles from './api-reference-explorer.module.scss';

export type APIReferenceExplorer = {
  apiNodeRendererSlot: APINodeRendererSlot;
} & HTMLAttributes<HTMLDivElement>;
