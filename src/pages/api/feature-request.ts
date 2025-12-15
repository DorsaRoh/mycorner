import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, email, url } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Log to console for now - you can integrate with email, Slack, etc.
  console.log('=== Feature Request ===');
  console.log('Message:', message);
  console.log('Email:', email || 'Not provided');
  console.log('URL:', url);
  console.log('Time:', new Date().toISOString());
  console.log('=======================');

  // TODO: Integrate with your preferred notification system:
  // - Send email notification
  // - Post to Slack channel
  // - Save to database
  // - Create GitHub issue

  return res.status(200).json({ success: true });
}
