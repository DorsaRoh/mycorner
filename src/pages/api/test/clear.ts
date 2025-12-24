/**
 * POST /api/test/clear
 * 
 * TEST-ONLY: Clears all data from the database.
 * This route is ONLY available when NODE_ENV === 'test'.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // CRITICAL: Only allow in test environment
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const db = await import('@/server/db/sqlite');
    
    db.db.exec(`
      DELETE FROM feedback;
      DELETE FROM product_feedback;
      DELETE FROM pages;
      DELETE FROM users;
    `);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[test/clear] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

