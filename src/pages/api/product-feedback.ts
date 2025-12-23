/**
 * POST /api/product-feedback
 * 
 * Submit feedback about the product/platform.
 * Body: { message: string, email?: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { message, email } = req.body;

    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // Validate email if provided
    const trimmedEmail = email?.trim();
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Import database
    const db = await import('@/server/db');

    // Add product feedback
    const feedback = db.addProductFeedback(trimmedMessage, trimmedEmail || null);

    // Log feedback in development
    console.log(`\n💬 New product feedback:`);
    console.log(`   Message: ${feedback.message}`);
    if (feedback.email) console.log(`   Email: ${feedback.email}`);
    console.log('');

    return res.status(200).json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('[api/product-feedback] Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

