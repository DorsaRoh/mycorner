import { useState, useCallback } from 'react';
import { ExploreDrawer } from './ExploreDrawer';
import styles from './PageFlipExplore.module.css';

export function PageFlipExplore() {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <div className={styles.container} onClick={handleClick}>
        <div className={styles.pageFlip}>
          <span className={styles.label}>explore</span>
        </div>
        <span className={styles.tooltip}>discover other pages</span>
      </div>

      <ExploreDrawer isOpen={isOpen} onClose={handleClose} />
    </>
  );
}
