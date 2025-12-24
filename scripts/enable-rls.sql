-- Enable Row Level Security on all tables
-- This blocks public access via Supabase REST API
-- Your app uses direct PostgreSQL connections, so this won't affect it

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Create restrictive policies that block all access via Supabase REST API
-- (Your app connects directly to PostgreSQL, bypassing RLS)

-- Users table: No public access
CREATE POLICY "No public access to users" ON users
  FOR ALL
  USING (false);

-- Pages table: No public access  
CREATE POLICY "No public access to pages" ON pages
  FOR ALL
  USING (false);

-- Feedback table: No public access
CREATE POLICY "No public access to feedback" ON feedback
  FOR ALL
  USING (false);

-- Product feedback table: No public access
CREATE POLICY "No public access to product_feedback" ON product_feedback
  FOR ALL
  USING (false);

-- App config table: No public access
CREATE POLICY "No public access to app_config" ON app_config
  FOR ALL
  USING (false);

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

