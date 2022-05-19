import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import React from "react";
import styles from "./composition-dropdown.module.scss";

export type CompositionDropdownProps = {
    dropdownItems: Array<{ label: string, value: string }>,
    side: "base" | "compare"
}

const baseCompQueryParam = "compositionBase";
const compareCompQueryParam = "compositionCompare";

export function CompositionDropdown(props: CompositionDropdownProps) {
    const { dropdownItems: data, side } = props;
    const query = useQuery();

    const href = (link: string) => {
        if (side === "base") {
            return `~compositions/~compare/${baseCompQueryParam}=${link}`;
        }
        if (side === "compare") {
            return `~compositions/~compare/${compareCompQueryParam}=${link}`;
        }
    }

    return (
        <Dropdown
            dropClass={styles.menu}
            placeholder={
                <div className={styles.placeholder}>
                    <div className={styles.placeholderTitle}>Helloooo</div>
                    <Icon of="fat-arrow-down" />
                </div>
            }
        >
            <div>
                {
                    data.map((item, index) => {

                        return (
                            <MenuLinkItem key={index} isActive={() => false} href={href(item.value)}>
                                <div>{item.label}</div>
                            </MenuLinkItem>
                        );
                    })
                }
            </div>
        </Dropdown>
    )
}