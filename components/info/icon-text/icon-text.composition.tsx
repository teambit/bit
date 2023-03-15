import React from 'react';
import { IconText } from './icon-text';

export const BasicIconText = () => {
  return <IconText icon={<img src="https://static.bit.cloud/bit-icons/map-marker.svg" />}>Distributed</IconText>;
};

export const IconTextWithoutIcon = () => {
  return <IconText>Just text</IconText>;
};

export const IconTextWithLink = () => {
  return <IconText icon={<img src="https://static.bit.cloud/bit-icons/link.svg" />} link="https://bit.cloud" />;
};

export const IconTextLinkWithChildren = () => {
  return (
    <IconText icon={<img src="https://static.bit.cloud/bit-icons/link.svg" />} link="https://bit.cloud">
      bit.cloud
    </IconText>
  );
};
