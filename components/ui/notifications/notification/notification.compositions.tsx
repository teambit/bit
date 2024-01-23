import React from 'react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { Theme } from '@teambit/base-ui.theme.theme-provider';
import { MessageLevel, Message } from '@teambit/ui-foundation.ui.notifications.store';
import { Notification } from './notification';

export const Preview = () => {
  const message: Message = {
    id: 'msgId01',
    level: MessageLevel.info,
    message: 'message content',
    time: new Date().toISOString(),
  };
  return <Notification entry={message} />;
};

export const DifferentLevels = () => {
  return (
    <Theme>
      <Notification
        entry={{
          id: 'msgId01',
          level: MessageLevel.success,
          message: 'message content',
          time: new Date().toISOString(),
        }}
      />
      <br />
      <Notification
        entry={{ id: 'msgId02', level: MessageLevel.info, message: 'message content', time: new Date().toISOString() }}
      />
      <br />
      <Notification
        entry={{
          id: 'msgId03',
          level: MessageLevel.warning,
          message: 'message content',
          time: new Date().toISOString(),
        }}
      />
      <br />
      <Notification
        entry={{ id: 'msgId04', level: MessageLevel.error, message: 'message content', time: new Date().toISOString() }}
      />
    </Theme>
  );
};

export const InDarkMode = () => {
  return (
    <Theme>
      <div className={darkMode}>
        <Notification
          entry={{
            id: 'msgId01',
            level: MessageLevel.success,
            message: 'message content',
            time: new Date().toISOString(),
          }}
        />
        <br />
        <Notification
          entry={{
            id: 'msgId02',
            level: MessageLevel.info,
            message: 'message content',
            time: new Date().toISOString(),
          }}
        />
        <br />
        <Notification
          entry={{
            id: 'msgId03',
            level: MessageLevel.warning,
            message: 'message content',
            time: new Date().toISOString(),
          }}
        />
        <br />
        <Notification
          entry={{
            id: 'msgId04',
            level: MessageLevel.error,
            message: 'message content',
            time: new Date().toISOString(),
          }}
        />
      </div>
    </Theme>
  );
};
