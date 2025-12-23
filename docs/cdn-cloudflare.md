# Cloudflare CDN Configuration

This guide covers configuring Cloudflare to serve static pages from object storage without hitting the Next.js server.

## Architecture Overview

```
User Request → Cloudflare Edge → Object Storage (R2/S3)
                                    ↓
                              pages/{slug}/index.html
```

When properly configured:
- `/u/{slug}` requests are rewritten to fetch `pages/{slug}/index.html` from storage
- The Next.js server is never touched for public page views
- Cache invalidation happens via Cloudflare API on publish

## Prerequisites

1. Domain on Cloudflare (proxied, orange cloud enabled)
2. Cloudflare R2 bucket or S3-compatible storage
3. Public access configured on storage bucket

## Option A: Single Domain (Recommended)

Use this when your app and storage are on the same domain.

### Step 1: Configure R2 Public Access

1. Go to **R2 > Your Bucket > Settings**
2. Under "Public access", click **Allow Access**
3. Choose "Custom domain" and add your domain (e.g., `cdn.yourdomain.com`)
4. Or use the R2.dev subdomain for testing

### Step 2: Create Transform Rule

1. Go to **Rules > Transform Rules**
2. Click **Create Rule**
3. Configure:

**Rule name:** `Rewrite /u/* to storage`

**When incoming requests match:**
```
(starts_with(http.request.uri.path, "/u/"))
```

**Then:**
- **Rewrite to:** Dynamic
- **Path:** `concat("/pages", substring(http.request.uri.path, 2), "/index.html")`

This transforms:
- `/u/alice` → `/pages/alice/index.html`
- `/u/user-abc12345` → `/pages/user-abc12345/index.html`

### Step 3: Configure Cache Rules

1. Go to **Rules > Cache Rules**
2. Click **Create Rule**

**Rule name:** `Cache static pages`

**When incoming requests match:**
```
(starts_with(http.request.uri.path, "/pages/"))
```

**Then:**
- **Cache eligibility:** Eligible for cache
- **Edge TTL:** 1 hour
- **Browser TTL:** Respect origin

## Option B: Separate Storage Domain

Use this when storage is on a different domain (e.g., `cdn.yourdomain.com`).

### Step 1: Configure Origin

Your `/u/[slug]` route already redirects to the storage URL when `S3_PUBLIC_BASE_URL` is set.

### Step 2: Enable Caching on Storage Domain

If using Cloudflare R2 with custom domain:

1. Go to **Rules > Cache Rules** for the storage domain
2. Create rule for `/pages/*`:
   - Cache: Eligible
   - Edge TTL: 1 hour (or as desired)

## Rate Limiting (Recommended)

Protect your endpoints with Cloudflare WAF rules.

### Step 1: Create Rate Limiting Rule

1. Go to **Security > WAF > Rate limiting rules**
2. Click **Create rule**

**For /api/upload:**
```
Rule name: Limit upload requests
When: (http.request.uri.path eq "/api/upload")
Rate: 20 requests per 1 minute
Action: Block for 1 minute
```

**For /api/publish:**
```
Rule name: Limit publish requests
When: (http.request.uri.path eq "/api/publish")
Rate: 10 requests per 1 minute
Action: Block for 1 minute
```

## Cache Purge Configuration

Set these environment variables for automatic cache purging on publish:

```bash
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ZONE_ID=your-zone-id

# All origins to purge (comma-separated)
APP_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Creating the API Token

1. Go to **My Profile > API Tokens**
2. Click **Create Token**
3. Use template: **Edit zone DNS** (or create custom)
4. Permissions needed:
   - Zone > Cache Purge > Purge
5. Zone Resources: Include your zone
6. Create and copy the token

## Environment Variables Summary

```bash
# Required for static pages
S3_PUBLIC_BASE_URL=https://cdn.yourdomain.com

# Required for CTA links and purge
APP_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Optional but recommended for cache purge
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ZONE_ID=your-zone-id
```

## Verifying Configuration

After setup, verify with the audit script:

```bash
npm run audit-page -- --slug user-abc12345
```

Expected output:
- Cache-Control header present
- Content-Type: text/html
- cf-cache-status: HIT (after first request)

## Troubleshooting

### Pages not caching

1. Check Cache-Control header on origin response
2. Verify cache rule is active
3. Check cf-cache-status header (MISS, HIT, DYNAMIC)

### Purge not working

1. Verify API token has Cache Purge permission
2. Check APP_ORIGINS includes exact URLs users hit (www vs apex)
3. Review server logs for purge errors

### Transform rule not matching

1. Test with `curl -I https://yourdomain.com/u/test`
2. Check Cloudflare's "Trace" tool in dashboard
3. Verify rule order (first matching rule wins)

## Cache Headers Reference

| Path | Cache-Control | Notes |
|------|--------------|-------|
| `/pages/*/index.html` | `public, max-age=3600` | Purged on publish |
| `/assets/*` | `public, max-age=31536000, immutable` | Content-addressed |
| `/u/*` (redirect) | Depends on storage | Should cache the redirect |

