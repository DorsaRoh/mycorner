/**
 * distributed rate limiting module.
 * 
 * supports multiple backends:
 * - memory: in-process (single instance only, default for dev)
 * - upstash: redis-based (distributed, recommended for production)
 * - cloudflare: edge-based (configured via cloudflare dashboard, docs only)
 * 
 * configuration:
 *   RATE_LIMIT_PROVIDER=memory|upstash|cloudflare
 *   UPSTASH_REDIS_REST_URL=https://...
 *   UPSTASH_REDIS_REST_TOKEN=...
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// =============================================================================
// types
// =============================================================================

export interface RateLimitConfig {
  /** unique key for this rate limit (e.g., 'upload', 'publish') */
  key: string;
  /** maximum requests per window */
  limit: number;
  /** window duration in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSec: number;
}

// =============================================================================
// configuration
// =============================================================================

type RateLimitProvider = 'memory' | 'upstash' | 'cloudflare';

function getProvider(): RateLimitProvider {
  const env = process.env.RATE_LIMIT_PROVIDER;
  if (env === 'upstash' || env === 'cloudflare') {
    return env;
  }
  // default to memory in development, upstash in production if configured
  if (process.env.NODE_ENV === 'production' && process.env.UPSTASH_REDIS_REST_URL) {
    return 'upstash';
  }
  return 'memory';
}

function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// =============================================================================
// memory backend (single instance)
// =============================================================================

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

// cleanup old entries periodically
let cleanupInterval: NodeJS.Timeout | null = null;
function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 60 * 1000); // every minute
  cleanupInterval.unref();
}

async function checkMemory(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  startCleanup();
  
  const key = `${config.key}:${identifier}`;
  const now = Date.now();
  const windowMs = config.windowSec * 1000;
  
  let entry = memoryStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    memoryStore.set(key, entry);
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetInSec: config.windowSec,
    };
  }
  
  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  
  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetInSec: Math.ceil((entry.resetAt - now) / 1000),
  };
}

// =============================================================================
// upstash backend (distributed)
// =============================================================================

interface UpstashResponse {
  result: number | null;
  error?: string;
}

async function upstashCommand(
  command: string[]
): Promise<UpstashResponse> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    throw new Error('upstash not configured');
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upstash request failed: ${response.status} ${text}`);
  }
  
  return response.json() as Promise<UpstashResponse>;
}

async function checkUpstash(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `ratelimit:${config.key}:${identifier}`;
  
  try {
    // use INCR + EXPIRE for fixed window rate limiting
    const incrResult = await upstashCommand(['INCR', key]);
    const count = incrResult.result ?? 1;
    
    // set expiry on first request
    if (count === 1) {
      await upstashCommand(['EXPIRE', key, String(config.windowSec)]);
    }
    
    // get TTL for remaining time
    const ttlResult = await upstashCommand(['TTL', key]);
    const ttl = ttlResult.result ?? config.windowSec;
    
    if (count > config.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetInSec: ttl,
      };
    }
    
    return {
      allowed: true,
      remaining: config.limit - count,
      resetInSec: ttl,
    };
  } catch (error) {
    console.error('[rate limit] upstash error, falling back to allow:', error);
    // fail open - allow request if redis is down
    return {
      allowed: true,
      remaining: config.limit,
      resetInSec: config.windowSec,
    };
  }
}

// =============================================================================
// public api
// =============================================================================

/**
 * get identifier from request.
 * uses IP + userId for per-user limiting.
 */
export function getIdentifier(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || 'unknown';
  
  const user = (req as unknown as Record<string, unknown>).user as { id?: string } | undefined;
  const userId = user?.id || 'anon';
  
  return `${ip}:${userId}`;
}

/**
 * check rate limit for a request.
 */
export async function rateLimit(
  req: NextApiRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const identifier = getIdentifier(req);
  const provider = getProvider();
  
  switch (provider) {
    case 'upstash':
      if (isUpstashConfigured()) {
        return checkUpstash(identifier, config);
      }
      // fall through to memory if not configured
      console.warn('[rate limit] upstash selected but not configured, using memory');
      return checkMemory(identifier, config);
      
    case 'cloudflare':
      // cloudflare rate limiting is configured at the edge, not in-app
      // we return allowed: true and rely on cloudflare WAF rules
      return {
        allowed: true,
        remaining: config.limit,
        resetInSec: config.windowSec,
      };
      
    case 'memory':
    default:
      return checkMemory(identifier, config);
  }
}

/**
 * apply rate limit to a next.js api handler.
 * returns true if request should proceed, false if rate limited.
 */
export async function applyRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  config: RateLimitConfig
): Promise<boolean> {
  const result = await rateLimit(req, config);
  
  // set rate limit headers
  res.setHeader('X-RateLimit-Limit', config.limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetInSec.toString());
  
  if (!result.allowed) {
    res.setHeader('Retry-After', result.resetInSec.toString());
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds: result.resetInSec,
    });
    return false;
  }
  
  return true;
}

// =============================================================================
// pre-configured rate limits
// =============================================================================

const isDev = process.env.NODE_ENV !== 'production';
const multiplier = isDev ? 10 : 1;

/** upload: 20 requests per minute (200 in dev) */
export const UPLOAD_LIMIT: RateLimitConfig = {
  key: 'upload',
  limit: 20 * multiplier,
  windowSec: 60,
};

/** publish: 10 requests per minute (100 in dev) */
export const PUBLISH_LIMIT: RateLimitConfig = {
  key: 'publish',
  limit: 10 * multiplier,
  windowSec: 60,
};

