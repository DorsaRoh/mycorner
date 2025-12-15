/**
 * Zod validation schemas for API inputs.
 * Used to validate page content before saving.
 */

import { z } from 'zod';

// =============================================================================
// Block validation
// =============================================================================

export const blockTypeSchema = z.enum(['TEXT', 'IMAGE', 'LINK']);

export const blockStyleSchema = z.object({
  borderRadius: z.number().min(0).max(1).optional(),
  shadowStrength: z.number().min(0).max(1).optional(),
  shadowSoftness: z.number().min(0).max(1).optional(),
  shadowOffsetX: z.number().min(-1).max(1).optional(),
  shadowOffsetY: z.number().min(-1).max(1).optional(),
  fontFamily: z.string().max(100).optional(),
  fontSize: z.number().min(1).max(500).optional(),
  fontWeight: z.number().min(100).max(900).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  color: z.string().max(50).optional(),
  textOpacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().min(0.5).max(5).optional(),
  textDecoration: z.enum(['none', 'underline', 'line-through']).optional(),
}).strict().optional();

export const blockEffectsSchema = z.object({
  brightness: z.number().min(-1).max(1).optional(),
  contrast: z.number().min(-1).max(1).optional(),
  saturation: z.number().min(-1).max(1).optional(),
  hueShift: z.number().min(-180).max(180).optional(),
  blur: z.number().min(0).max(1).optional(),
}).strict().optional();

export const blockSchema = z.object({
  id: z.string().max(100),
  type: blockTypeSchema,
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  width: z.number().min(1).max(5000),
  height: z.number().min(1).max(5000),
  content: z.string().max(50000), // 50KB max per block content
  style: blockStyleSchema,
  effects: blockEffectsSchema,
  rotation: z.number().min(-180).max(180).optional(),
  isStarter: z.boolean().optional(),
}).strict();

export const blocksArraySchema = z.array(blockSchema).max(100); // Max 100 blocks per page

// =============================================================================
// Background validation
// =============================================================================

export const backgroundSolidSchema = z.object({
  color: z.string().max(50),
}).strict();

export const backgroundGradientSchema = z.object({
  type: z.enum(['linear', 'radial']),
  colorA: z.string().max(50),
  colorB: z.string().max(50),
  angle: z.number().min(0).max(360),
}).strict();

export const backgroundImageSchema = z.object({
  url: z.string().url().max(500),
  fit: z.enum(['cover', 'contain', 'fill', 'tile']),
  position: z.enum(['center', 'top', 'bottom', 'left', 'right']),
  opacity: z.number().min(0).max(1),
}).strict();

export const backgroundConfigSchema = z.object({
  mode: z.enum(['solid', 'gradient', 'image']),
  solid: backgroundSolidSchema.optional(),
  gradient: backgroundGradientSchema.optional(),
  image: backgroundImageSchema.optional(),
}).strict().optional();

// =============================================================================
// Page input validation
// =============================================================================

export const updatePageInputSchema = z.object({
  title: z.string().max(200).optional(),
  blocks: blocksArraySchema.optional(),
  background: backgroundConfigSchema,
  localRevision: z.number().int().min(0).optional(),
  baseServerRevision: z.number().int().min(0).optional(),
}).strict();

export const publishPageInputSchema = z.object({
  blocks: blocksArraySchema,
  background: backgroundConfigSchema,
  baseServerRevision: z.number().int().min(0),
}).strict();

// =============================================================================
// Username validation
// =============================================================================

export const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores')
  .transform(s => s.toLowerCase());

// Reserved usernames that can't be claimed
export const RESERVED_USERNAMES = new Set([
  // Routes
  'admin', 'api', 'auth', 'edit', 'new', 'p', 'u', 'user', 'users',
  'page', 'pages', 'public', 'private', 'settings', 'profile',
  'login', 'logout', 'signup', 'register', 'signin', 'signout',
  'help', 'support', 'about', 'terms', 'privacy', 'legal',
  'blog', 'docs', 'documentation', 'faq', 'status', 'health',
  // Brand
  'mycorner', 'my_corner', 'corner', 'official', 'team', 'staff',
  // Common
  'test', 'demo', 'example', 'sample', 'null', 'undefined',
  'root', 'system', 'bot', 'moderator', 'mod', 'anonymous',
  'www', 'mail', 'email', 'ftp', 'ssh', 'cdn', 'assets',
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

// =============================================================================
// Validation helpers
// =============================================================================

export function validateBlocks(blocks: unknown): { valid: boolean; error?: string; data?: z.infer<typeof blocksArraySchema> } {
  const result = blocksArraySchema.safeParse(blocks);
  if (!result.success) {
    return { valid: false, error: result.error.issues?.[0]?.message || 'Invalid blocks' };
  }
  return { valid: true, data: result.data };
}

export function validateBackground(background: unknown): { valid: boolean; error?: string; data?: z.infer<typeof backgroundConfigSchema> } {
  const result = backgroundConfigSchema.safeParse(background);
  if (!result.success) {
    return { valid: false, error: result.error.issues?.[0]?.message || 'Invalid background' };
  }
  return { valid: true, data: result.data };
}

export function validateUpdatePageInput(input: unknown): { valid: boolean; error?: string; data?: z.infer<typeof updatePageInputSchema> } {
  const result = updatePageInputSchema.safeParse(input);
  if (!result.success) {
    return { valid: false, error: result.error.issues?.[0]?.message || 'Invalid input' };
  }
  return { valid: true, data: result.data };
}

export function validatePublishPageInput(input: unknown): { valid: boolean; error?: string; data?: z.infer<typeof publishPageInputSchema> } {
  const result = publishPageInputSchema.safeParse(input);
  if (!result.success) {
    return { valid: false, error: result.error.issues?.[0]?.message || 'Invalid input' };
  }
  return { valid: true, data: result.data };
}

