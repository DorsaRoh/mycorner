/**
 * POST /api/feedback
 * 
 * Submit feedback for a published page.
 * Body: { pageId: string, message: string, email?: string }
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
    const { pageId, message, email } = req.body;

    if (!pageId || typeof pageId !== 'string') {
      return res.status(400).json({ success: false, message: 'Page ID is required' });
    }

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

    // Check if page exists and is published
    const page = await db.getPageById(pageId);
    if (!page || !page.is_published) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }

    // Add feedback
    const feedback = await db.addFeedback(pageId, trimmedMessage, trimmedEmail || null);

    // Log feedback in development
    console.log(`\n💬 New feedback for page ${pageId}:`);
    console.log(`   Message: ${feedback.message}`);
    if (feedback.email) console.log(`   Email: ${feedback.email}`);
    console.log('');

    return res.status(200).json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('[api/feedback] Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

