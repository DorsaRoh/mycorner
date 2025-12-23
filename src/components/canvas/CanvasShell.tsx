/**
 * CanvasShell - Shared canvas container for consistent sizing and layering.
 * 
 * CRITICAL: This component provides the SAME DOM structure and sizing
 * for both the editor (/new) and viewer (/{slug}) to ensure identical
 * rendering between preview and published pages.
 * 
 * Features:
 * - Consistent viewport-based sizing (100vw × 100vh)
 * - Consistent z-index layering (background < blocks < overlays)
 * - Consistent measurement container for useCanvasSize
 * - Optional debug overlay showing dimensions/scale/route
 */

import { useMemo, useEffect, forwardRef } from 'react';
import { useRouter } from 'next/router';
import type { BackgroundConfig } from '@/shared/types';
import { getBackgroundStyles } from '@/shared/utils/blockStyles';
import { 
  useCanvasSize, 
  CanvasDimensions,
  REFERENCE_WIDTH, 
  REFERENCE_HEIGHT 
} from '@/lib/canvas';
import styles from './CanvasShell.module.css';

export interface CanvasShellProps {
  /** Mode determines sizing behavior */
  mode: 'editor' | 'viewer';
  
  /** Background configuration */
  background?: BackgroundConfig;
  
  /** Content to render (blocks) */
  children: React.ReactNode;
  
  /** Callback when dimensions change */
  onDimensionsChange?: (dims: CanvasDimensions) => void;
  
  /** Callback when resize starts (for canceling interactions) */
  onResizeStart?: () => void;
  
  /** Array of block bounds for content sizing (optional) */
  blockBounds?: Array<{ x: number; y: number; width: number; height: number }>;
  
  /** Additional class name */
  className?: string;
  
  /** Additional inline styles for canvas */
  style?: React.CSSProperties;
  
  /** Mouse event handlers for editor interactivity */
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  
  /** Whether to show debug overlay (dev only) */
  showDebug?: boolean;
}

export interface CanvasShellRef {
  containerRef: React.RefObject<HTMLDivElement>;
  dimensions: CanvasDimensions;
  recalculate: () => void;
  isResizing: boolean;
}

/**
 * CanvasShell provides a consistent container for canvas rendering.
 * 
 * Usage:
 * ```tsx
 * // In Editor
 * <CanvasShell mode="editor" background={bg} onDimensionsChange={setDims}>
 *   {blocks.map(block => <Block key={block.id} ... />)}
 * </CanvasShell>
 * 
 * // In Viewer
 * <CanvasShell mode="viewer" background={bg}>
 *   {blocks.map(block => <ViewerBlock key={block.id} ... />)}
 * </CanvasShell>
 * ```
 */
export const CanvasShell = forwardRef<CanvasShellRef, CanvasShellProps>(
  function CanvasShell(
    {
      mode,
      background,
      children,
      onDimensionsChange,
      onResizeStart,
      blockBounds = [],
      className = '',
      style,
      onMouseDown,
      onClick,
      onDrop,
      onDragOver,
      showDebug = false,
    },
    ref
  ) {
    const router = useRouter();
    
    // Use responsive canvas sizing with ResizeObserver
    const { dimensions, containerRef, isResizing, recalculate } = useCanvasSize({
      debounceMs: 16,
      onResizeStart,
    });
    
    // Expose ref API
    useEffect(() => {
      if (ref && typeof ref === 'object') {
        ref.current = {
          containerRef,
          dimensions,
          recalculate,
          isResizing,
        };
      }
    }, [ref, containerRef, dimensions, recalculate, isResizing]);
    
    // Notify parent of dimension changes
    useEffect(() => {
      onDimensionsChange?.(dimensions);
    }, [dimensions, onDimensionsChange]);
    
    // Debug logging in development (useEffect, not render phase)
    useEffect(() => {
      if (process.env.NODE_ENV !== 'production' && showDebug) {
        console.log('[CanvasShell] Dimensions:', {
          route: router.asPath,
          mode,
          width: dimensions.width,
          height: dimensions.height,
          scale: dimensions.scale,
          offsetX: dimensions.offsetX,
          offsetY: dimensions.offsetY,
        });
      }
    }, [dimensions, mode, router.asPath, showDebug]);
    
    // Get background styles
    const { canvasStyle, bgImageStyle } = useMemo(
      () => getBackgroundStyles(background),
      [background]
    );
    
    // Calculate content bounds for scrollable area
    const contentBounds = useMemo(() => {
      // Ensure we have valid scale
      const safeScale = Number.isFinite(dimensions.scale) && dimensions.scale > 0 
        ? dimensions.scale 
        : 1;
      const safeOffsetX = Number.isFinite(dimensions.offsetX) 
        ? dimensions.offsetX 
        : 0;
      
      if (blockBounds.length === 0) {
        return { 
          width: REFERENCE_WIDTH * safeScale,
          height: REFERENCE_HEIGHT * safeScale 
        };
      }
      
      // Find the maximum extent of all blocks in reference coords
      let maxRefX = REFERENCE_WIDTH;
      let maxRefY = REFERENCE_HEIGHT;
      
      blockBounds.forEach(block => {
        const blockRight = block.x + block.width;
        const blockBottom = block.y + block.height;
        maxRefX = Math.max(maxRefX, blockRight);
        maxRefY = Math.max(maxRefY, blockBottom);
      });
      
      // Convert to pixels and add padding
      return {
        width: maxRefX * safeScale + safeOffsetX + 40,
        height: maxRefY * safeScale + 40,
      };
    }, [blockBounds, dimensions]);
    
    // Combine styles
    const combinedStyle = useMemo(() => ({
      ...canvasStyle,
      ...style,
    }), [canvasStyle, style]);
    
    // Mode-specific class
    const modeClass = mode === 'editor' ? styles.editorMode : styles.viewerMode;
    
    // Check if debug should be shown
    const shouldShowDebug = useMemo(() => {
      if (typeof window === 'undefined') return false;
      if (process.env.NODE_ENV === 'production') return false;
      
      // Show if prop is true OR if global debug flag is set
      return showDebug || (window as unknown as { __CANVAS_DEBUG?: boolean }).__CANVAS_DEBUG === true;
    }, [showDebug]);
    
    return (
      <div
        ref={containerRef}
        className={`${styles.shell} ${modeClass} ${className}`}
        style={combinedStyle}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {/* Content sizer - ensures canvas can scroll to show all content */}
        <div 
          className={styles.contentSizer} 
          style={{ 
            minWidth: contentBounds.width, 
            minHeight: contentBounds.height 
          }} 
        />
        
        {/* Background image layer */}
        {bgImageStyle && (
          <div className={styles.bgImageLayer} style={bgImageStyle} />
        )}
        
        {/* Blocks container */}
        <div className={styles.blocksContainer}>
          {children}
        </div>
        
        {/* Debug overlay (dev only) */}
        {shouldShowDebug && (
          <div className={styles.debugOverlay}>
            {`Route: ${router.asPath}
Mode: ${mode}
Container: ${dimensions.width.toFixed(0)}×${dimensions.height.toFixed(0)}px
Scale: ${dimensions.scale.toFixed(4)}
Offset: (${dimensions.offsetX.toFixed(0)}, ${dimensions.offsetY.toFixed(0)})
Reference: ${REFERENCE_WIDTH}×${REFERENCE_HEIGHT}`}
          </div>
        )}
      </div>
    );
  }
);

export default CanvasShell;

