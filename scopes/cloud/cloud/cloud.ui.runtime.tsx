import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { flatten } from 'lodash';
import { SubMenu } from '@teambit/design.controls.menu';
// import { useThemePicker, useNextTheme } from '@teambit/base-react.themes.theme-switcher';
import { Slot } from '@teambit/harmony';
import { UserBar, UserBarItem, UserBarItemSlot, UserBarSection, UserBarSectionSlot } from '@teambit/cloud.ui.user-bar';
import { LanesAspect, LanesUI } from '@teambit/lanes';
import { WorkspaceAspect, WorkspaceUI } from '@teambit/workspace';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { CloudAspect } from './cloud.aspect';

export class CloudUI {
  constructor(
    private userBarSectionSlot: UserBarSectionSlot,
    private userBarItemSlot: UserBarItemSlot
  ) {}
  /**
   * register a new user bar item.
   */
  registerUserBarItem(userBarItem: UserBarItem[]) {
    this.userBarItemSlot.register(userBarItem);
    return this;
  }

  /**
   * register a new user bar section
   */
  registerUserBarSection(sections: UserBarSection[]) {
    this.userBarSectionSlot.register(sections);
    return this;
  }

  /**
   * list user bar items.
   */
  listUserBarItems() {
    return flatten(this.userBarItemSlot.values());
  }

  /**
   * list all user bar sections.
   */
  listUserBarSections() {
    return flatten(this.userBarSectionSlot.values());
  }

  CloudUserBar = () => {
    return <UserBar sections={this.listUserBarSections()} items={this.listUserBarItems()} />;
  };

  static runtime = UIRuntime;

  static dependencies = [WorkspaceAspect, LanesAspect, ComponentAspect];

  static slots = [Slot.withType<UserBarItem[]>(), Slot.withType<UserBarSection[]>()];

  static async provider(
    [workspace, lanes, component]: [WorkspaceUI, LanesUI, ComponentUI],
    _,
    [userBarItemSlot, userBarSectionSlot]: [UserBarItemSlot, UserBarSectionSlot]
  ) {
    const cloudUI = new CloudUI(userBarSectionSlot, userBarItemSlot);

    cloudUI.registerUserBarSection([
      {
        displayName: 'Scopes & Components',
        categoryName: 'ScopesAndComponents',
      },
      {
        displayName: 'Docs, Support & Feedback',
        categoryName: 'DocsSupportAndFeedback',
      },
    ]);
    cloudUI.registerUserBarItem([
      {
        icon: 'settings',
        label: 'Settings',
        href: 'https://bit.cloud/settings',
      },
      {
        category: 'ScopesAndComponents',
        icon: 'components',
        label: 'Your components',
        href: 'https://bit.cloud/components',
      },
      {
        category: 'ScopesAndComponents',
        icon: 'collection',
        label: 'Your scopes',
        href: 'https://bit.cloud/scopes',
      },
      {
        category: 'DocsSupportAndFeedback',
        icon: 'book-glossary',
        label: 'Bit Docs',
        href: 'https://bit.dev/docs',
      },
      {
        category: 'DocsSupportAndFeedback',
        component: function Support() {
          return (
            <SubMenu
              item={{
                label: 'Support',
                icon: 'users',
                children: [
                  {
                    label: 'Bit Community on bit.cloud',
                    link: 'https://bit.cloud/bitdev',
                  },
                  {
                    label: 'Ticket Support',
                    link: 'https://support.bit.cloud',
                  },
                  {
                    label: 'Bit Community Slack',
                    link: 'https://join.slack.com/t/bit-dev-community/shared_invite/zt-29pmawrp1-ehfEzYbQyuAC3CNA_jYPvA',
                  },
                ],
              }}
            />
          );
        },
      },
      // {
      //   category: 'DocsSupportAndFeedback',
      //   component: function ThemePicker() {
      //     const next = useNextTheme();
      //     const { currentIdx } = useThemePicker();
      //     return (
      //       <SubMenu
      //         item={{
      //           label: 'Theme',
      //           icon: 'lightmode',
      //           children: [
      //             {
      //               label: 'Light',
      //               icon: currentIdx === 0 ? 'checkmark' : '',
      //               onClick: () => {
      //                 if (currentIdx === 0) return;
      //                 next();
      //               },
      //             },
      //             {
      //               label: 'Dark',
      //               icon: currentIdx === 1 ? 'checkmark' : '',
      //               onClick: () => {
      //                 if (currentIdx === 1) return;
      //                 next();
      //               },
      //             },
      //           ],
      //         }}
      //       />
      //     );
      //   },
      // },
    ]);
    workspace.registerMenuWidget([cloudUI.CloudUserBar]);
    if (workspace) {
      lanes.registerMenuWidget(cloudUI.CloudUserBar);
      component.registerRightSideMenuItem({
        item: <cloudUI.CloudUserBar key={'cloud-user-bar-comp-menu'} />,
        order: 100,
      });
    }
    return cloudUI;
  }
}

export default CloudUI;

CloudAspect.addRuntime(CloudUI);
