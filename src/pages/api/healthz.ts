/**
 * GET /api/healthz
 * 
 * production health check endpoint.
 * 
 * returns 200 only if critical subsystems are configured:
 * - S3_PUBLIC_BASE_URL must be set in production
 * - upload must be configured if in production
 * 
 * use this endpoint for:
 * - kubernetes/docker health checks
 * - load balancer health probes
 * - deployment verification
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { isPublicPagesConfigured, isUploadConfigured } from '@/server/storage/client';
import { isPurgeConfigured, getAppOrigins } from '@/server/cdn/purge';

// =============================================================================
// types
// =============================================================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  environment: string;
  subsystems: {
    publicPages: SubsystemStatus;
    upload: SubsystemStatus;
    purge: SubsystemStatus;
  };
  config: {
    appOrigins: string[];
    publicBaseUrl: string | null;
  };
}

interface SubsystemStatus {
  configured: boolean;
  required: boolean;
  error?: string;
}

// =============================================================================
// handler
// =============================================================================

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthStatus>
) {
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();
  
  // check subsystems
  const publicPagesConfigured = isPublicPagesConfigured();
  const uploadConfigured = isUploadConfigured();
  const purgeConfigured = isPurgeConfigured();
  const appOrigins = getAppOrigins();
  
  // build subsystem status
  const subsystems: HealthStatus['subsystems'] = {
    publicPages: {
      configured: publicPagesConfigured,
      required: isProduction,
      error: isProduction && !publicPagesConfigured 
        ? 'S3_PUBLIC_BASE_URL is required in production' 
        : undefined,
    },
    upload: {
      configured: uploadConfigured,
      required: isProduction,
      error: isProduction && !uploadConfigured 
        ? 'S3 upload credentials are required in production' 
        : undefined,
    },
    purge: {
      configured: purgeConfigured,
      required: false, // purge is optional but recommended
      error: purgeConfigured && appOrigins.length === 0 && isProduction
        ? 'APP_ORIGINS should be set when purge is configured'
        : undefined,
    },
  };
  
  // determine overall status
  let status: HealthStatus['status'] = 'healthy';
  
  // unhealthy if required subsystems are missing
  if (subsystems.publicPages.required && !subsystems.publicPages.configured) {
    status = 'unhealthy';
  }
  if (subsystems.upload.required && !subsystems.upload.configured) {
    status = 'unhealthy';
  }
  
  // degraded if optional subsystems have issues
  if (subsystems.purge.error) {
    if (status === 'healthy') status = 'degraded';
  }
  
  const healthStatus: HealthStatus = {
    status,
    timestamp,
    environment: process.env.NODE_ENV || 'development',
    subsystems,
    config: {
      appOrigins,
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || null,
    },
  };
  
  // return appropriate status code
  const statusCode = status === 'unhealthy' ? 503 : 200;
  
  res.status(statusCode).json(healthStatus);
}

