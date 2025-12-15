import styles from './FloatingAction.module.css';

interface FloatingActionProps {
  isOwner: boolean;
  onEdit: () => void;
}

export function FloatingAction({
  isOwner,
  onEdit,
}: FloatingActionProps) {
  // Only show Edit button for owners
  if (!isOwner) {
    return null;
  }

  return (
    <button className={styles.fab} onClick={onEdit}>
      Edit
    </button>
  );
}
