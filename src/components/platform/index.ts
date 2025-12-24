/**
 * Platform UI Components
 * 
 * A unified set of UI primitives for platform elements that automatically
 * adapt to any page background. These are NOT for user content, only for
 * platform chrome (buttons, panels, toasts, etc.).
 * 
 * Usage:
 * 1. Wrap your page in <PlatformUiProvider background={...}>
 * 2. Use the provided components: UiButton, UiPanel, UiToast, etc.
 * 
 * Or use the token system directly:
 * 1. Import { getUiTokenStyles, getUiMode } from '@/lib/platformUi'
 * 2. Apply token styles to a container element
 * 3. Use --platform-* CSS variables in component styles
 */

export { PlatformUiProvider, usePlatformUi } from './PlatformUiProvider';
export { UiButton, UiIconButton } from './UiButton';
export { UiChip, UiChipLink } from './UiChip';
export { UiPanel, UiMenuItem, UiMenuDivider } from './UiPanel';
export { 
  UiModal, 
  UiModalHeader, 
  UiModalBody, 
  UiModalFooter, 
  UiModalTitle, 
  UiModalSubtitle 
} from './UiModal';

