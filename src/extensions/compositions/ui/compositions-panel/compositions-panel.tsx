import React, { useState } from 'react';
import classNames from 'classnames';
import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';

export type CompositionsPanelProps = {
  compositions: Composition[];
  onCompositionSelect: (composition: Composition) => void;
};
// TODO - this is WIP - move node component to compositions panel node
export function CompositionsPanel({ compositions, onCompositionSelect }: CompositionsPanelProps) {
  const [active, setActive] = useState(0);

  const onSelect = (nextActive, composition) => {
    if (!onCompositionSelect) return;
    setActive(nextActive);
    onCompositionSelect(composition);
  };
  return (
    <div className={styles.panelBox}>
      <div className={styles.tabs}>
        <div>compositions</div>
        <div>properties</div>
        <div>dependencies</div>
      </div>
      <ul className={styles.composition}>
        {compositions.map((composition, key) => {
          return (
            <li key={key} className={classNames(styles.linkWrapper, { [styles.active]: active === key })}>
              <span className={styles.box}>&#9632;</span>
              <a className={styles.panelLink} onClick={() => onSelect(key, composition)}>
                {composition.displayName}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// export function CompositionsPanel({ compositions, onCompositionSelect }: CompositionsPanelProps) {
//   const [active, setActive] = useState(0);

//   const onSelect = (nextActive, composition) => {
//     if(!onCompositionSelect) return;
//     setActive(nextActive);
//     onCompositionSelect(composition)
//   }
//   return (
//     <div className={styles.composition}>
//       <div className={styles.tabs}>
//         <div>compositions</div>
//         <div>properties</div>
//         <div>dependencies</div>
//       </div>
//       <ul className={styles.list}>
//         {compositions.map((composition, key) => {
//           return (
//             <li key={key} className={styles.bg}>
//             <CompositionsPanelNode
//               key={key}
//               isActive={active === key}
//               name={composition.displayName}
//               onClick={() => onSelect(key, composition)}
//             />
//             </li>
//           );
//         })}
//       </ul>
//     </div>
//   );
// }
