/**
 * Starter Layout - Desktop and Mobile layouts for new pages
 * 
 * Two distinct compositions optimized for each viewport:
 * - Desktop: asymmetric, playful layout with rotation and overlap
 * - Mobile: organic, "found artifact" layout - left-aligned, asymmetric spacing,
 *   image with rotation/offset, quiet link styling (NOT a centered marketing hero)
 */

import type { Block as BlockType } from '@/shared/types';
import { serializeLinkContent } from '@/shared/utils/blockStyles';
import { REFERENCE_WIDTH, VIEWPORT_BREAKPOINT } from '@/lib/canvas';

export const STARTER_BLOCK_PREFIX = 'block_starter_';
export const HINT_BLOCK_ID = 'block_starter_hint';
export const DEFAULT_STARTER_BACKGROUND = {
  mode: 'solid' as const,
  solid: { color: '#f8f6f1' },
};

// Re-export breakpoint for consistency
export { VIEWPORT_BREAKPOINT };

// Shared styles
const TEXT_STYLE = { borderRadius: 0, shadowStrength: 0, shadowSoftness: 0.5, shadowOffsetX: 0, shadowOffsetY: 0.2 };
const IMAGE_STYLE = { borderRadius: 0.025, shadowStrength: 0.12, shadowSoftness: 0.65, shadowOffsetX: 0.02, shadowOffsetY: 0.05 };

/**
 * Creates starter blocks for a new page.
 * @param isMobile - true for mobile layout, false for desktop
 */
export function createStarterBlocks(isMobile: boolean): BlockType[] {
  const now = Date.now();

  // ========== MOBILE LAYOUT ==========
  // Organic, personal "found artifact" feel - NOT a marketing landing page
  // 
  // Design principles:
  // - Left-aligned, asymmetric layout (breaks the "centered hero" pattern)
  // - Irregular spacing (tight in some spots, airy in others)
  // - Image feels "placed" with rotation and offset
  // - Quiet, reference-style link (not a CTA)
  // - Overall feel: a personal note, not product onboarding
  //
  // On 375px screen, scale = 0.31, so we design in ref coords accordingly
  if (isMobile) {
    const leftMargin = 65; // Asymmetric left margin
    const contentWidth = REFERENCE_WIDTH - leftMargin - 50; // Leave some right breathing room
    const imageWidth = Math.round(contentWidth * 0.92); // Near full width
    const imageHeight = Math.round(imageWidth * 0.65);
    // Offset image slightly to left for asymmetry (not perfectly centered)
    const imageX = leftMargin - 20;

    return [
      // Headline - left-aligned, not at very top, sized for natural 2-line wrap
      {
        id: `${STARTER_BLOCK_PREFIX}headline_${now}`,
        type: 'TEXT',
        x: leftMargin,
        y: 260, // Lower than typical hero (publish button safe + breathing room)
        width: 920, // Narrower to encourage natural wrap
        height: 200,
        content: 'your corner of the internet',
        rotation: 0,
        style: { 
          ...TEXT_STYLE, 
          fontSize: 82, // Smaller than before (was 100)
          fontWeight: 500, 
          color: 'rgba(55, 50, 45, 0.92)', 
          textAlign: 'left', // Left-aligned, not centered
          lineHeight: 1.08,
        },
        isStarter: true,
      },
      // Subcopy - single line, personal tone, tight spacing to headline
      {
        id: `${STARTER_BLOCK_PREFIX}subcopy_${now}`,
        type: 'TEXT',
        x: leftMargin + 8, // Slight indent from headline
        y: 485, // Tight spacing after headline (was 480 for subtitle1)
        width: 800,
        height: 60,
        content: 'leave pieces of yourself here.',
        rotation: 0,
        style: { 
          ...TEXT_STYLE, 
          fontSize: 48, // Smaller, quieter
          fontWeight: 400, 
          color: 'rgba(130, 125, 115, 0.85)', // Lower contrast
          textAlign: 'left',
        },
        isStarter: true,
      },
      // Image - near full width, rotation for "placed" feel, offset for asymmetry
      {
        id: `${STARTER_BLOCK_PREFIX}image_${now}`,
        type: 'IMAGE',
        x: imageX,
        y: 620, // More air above (irregular spacing)
        width: imageWidth,
        height: imageHeight,
        content: '/hero-flowers.png',
        rotation: -3, // Negative rotation for organic feel
        style: {
          ...IMAGE_STYLE,
          borderRadius: 0.035, // Slightly more rounded (14-18px equiv)
          shadowStrength: 0.08, // Softer shadow
          shadowSoftness: 0.75,
        },
        isStarter: true,
      },
      // Caption - small, italic, offset left, low contrast
      {
        id: `${STARTER_BLOCK_PREFIX}caption_${now}`,
        type: 'TEXT',
        x: leftMargin + 25, // Slight indent (like a handwritten note)
        y: 620 + imageHeight + 35, // Tighter to image
        width: 500, // Narrower
        height: 50,
        content: 'something i love',
        rotation: 0,
        style: { 
          ...TEXT_STYLE, 
          fontSize: 38, // Smaller
          fontWeight: 400, 
          fontFamily: 'Georgia, "Times New Roman", serif', 
          fontStyle: 'italic', 
          color: 'rgba(155, 145, 135, 0.7)', // Lower contrast
          textAlign: 'left', // Left-aligned
          lineHeight: 1.3,
        },
        isStarter: true,
      },
      // Link - quiet reference style, not a CTA
      {
        id: `${STARTER_BLOCK_PREFIX}link_${now}`,
        type: 'LINK',
        x: leftMargin + 20,
        y: 620 + imageHeight + 180, // More space from caption (irregular)
        width: 600,
        height: 140, // Still large for tap target (44px+ when scaled)
        content: serializeLinkContent('this changed how i think →', 'https://'),
        rotation: 0,
        style: { 
          ...TEXT_STYLE, 
          fontSize: 40, // Smaller, quieter
          fontWeight: 450, // Lighter weight
          color: 'rgba(95, 85, 120, 0.55)', // Lower contrast, still accessible
          textAlign: 'left',
        },
        isStarter: true,
      },
    ];
  }

  // ========== DESKTOP LAYOUT ==========
  return [
    {
      id: `${STARTER_BLOCK_PREFIX}headline_${now}`,
      type: 'TEXT',
      x: 80,
      y: 220,
      width: 1000,
      height: 80,
      content: 'your corner of the internet',
      rotation: 0,
      style: { ...TEXT_STYLE, fontSize: 76, fontWeight: 500, color: 'rgba(60, 55, 50, 1)', textAlign: 'center' },
      isStarter: true,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}subtitle1_${now}`,
      type: 'TEXT',
      x: 150,
      y: 360,
      width: 280,
      height: 36,
      content: 'make this your own',
      rotation: 0,
      style: { ...TEXT_STYLE, fontSize: 26, fontWeight: 400, color: 'rgba(145, 140, 130, 1)', textAlign: 'left' },
      isStarter: true,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}subtitle2_${now}`,
      type: 'TEXT',
      x: 150,
      y: 405,
      width: 220,
      height: 36,
      content: 'full freedom, all you',
      rotation: 0,
      style: { ...TEXT_STYLE, fontSize: 26, fontWeight: 400, color: 'rgba(145, 140, 130, 1)', textAlign: 'left' },
      isStarter: true,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}link_${now}`,
      type: 'LINK',
      x: 245,
      y: 580,
      width: 280,
      height: 40,
      content: serializeLinkContent('→ this changed how i think', 'https://'),
      rotation: 0,
      style: { ...TEXT_STYLE, fontSize: 18, fontWeight: 600, color: 'rgba(103, 37, 153, 0.67)' },
      isStarter: true,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}image_${now}`,
      type: 'IMAGE',
      x: 630,
      y: 420,
      width: 400,
      height: 265,
      content: '/hero-flowers.png',
      rotation: 3,
      style: IMAGE_STYLE,
      isStarter: true,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}caption_${now}`,
      type: 'TEXT',
      x: 725,
      y: 710,
      width: 180,
      height: 55,
      content: 'something i love',
      rotation: 3,
      style: { ...TEXT_STYLE, fontSize: 17, fontWeight: 400, fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', color: 'rgba(170, 160, 150, 1)', textAlign: 'center', lineHeight: 1.35 },
      isStarter: true,
    },
  ];
}
