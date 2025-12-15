/**
 * Database types shared between SQLite and PostgreSQL adapters.
 * This ensures both adapters return compatible types.
 */

export interface DbUser {
  id: string;
  email: string;
  google_sub: string;
  name: string | null;
  avatar_url: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbPage {
  id: string;
  user_id: string | null;
  owner_id: string;
  title: string | null;
  slug: string | null;
  content: string; // JSON string of blocks array (draft)
  background: string | null; // JSON string of BackgroundConfig (draft)
  published_content: string | null; // JSON string of blocks array (published snapshot)
  published_background: string | null; // JSON string of BackgroundConfig (published snapshot)
  published_at: string | null; // ISO timestamp of last publish
  published_revision: number | null; // server_revision at time of publish
  is_published: number;
  forked_from_id: string | null;
  server_revision: number;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface DbFeedback {
  id: string;
  page_id: string;
  message: string;
  email: string | null;
  created_at: string;
}

export interface DbProductFeedback {
  id: string;
  message: string;
  email: string | null;
  created_at: string;
}

export interface PublishPageParams {
  id: string;
  content: string; // JSON blocks to publish
  background?: string | null; // JSON background to publish
  baseServerRevision: number; // For conflict detection
  slug?: string;
}

export interface PublishPageResult {
  page: DbPage | null;
  conflict: boolean;
  publishedRevision: number | null;
  publishedAt: string | null;
}

