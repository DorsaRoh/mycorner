/**
 * Rate limiting middleware for API endpoints.
 * Uses express-rate-limit for simple in-memory rate limiting.
 */

import rateLimit from 'express-rate-limit';
import { getConfig } from '../lib/config';

const config = getConfig();

// More lenient in development
const multiplier = config.isDev ? 10 : 1;

/**
 * General API rate limit - 100 requests per minute in production.
 */
export const generalApiLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 * multiplier,
  message: { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Save endpoint rate limit - 30 saves per minute per IP.
 * This is generous enough for auto-save but prevents abuse.
 */
export const saveLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30 * multiplier,
  message: { error: 'Too many save requests. Please wait a moment.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Publish endpoint rate limit - 10 publishes per minute per IP.
 * Publishing should be intentional and infrequent.
 */
export const publishLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10 * multiplier,
  message: { error: 'Too many publish requests. Please wait a moment.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Auth endpoint rate limit - 20 auth attempts per 15 minutes per IP.
 * Prevents brute force attacks.
 */
export const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20 * multiplier,
  message: { error: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Upload endpoint rate limit - 20 uploads per minute per IP.
 */
export const uploadLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20 * multiplier,
  message: { error: 'Too many upload requests. Please wait a moment.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Feedback endpoint rate limit - 5 feedback submissions per minute.
 */
export const feedbackLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5 * multiplier,
  message: { error: 'Too many feedback submissions. Please wait a moment.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

