/**
 * Drizzle ORM schema for PostgreSQL.
 * This defines the database structure for production.
 */

import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';

// =============================================================================
// Users
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  googleSub: text('google_sub').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  username: text('username').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// =============================================================================
// Pages
// =============================================================================

export const pages = pgTable('pages', {
  id: text('id').primaryKey(), // page_xxx format
  userId: uuid('user_id').references(() => users.id),
  ownerId: text('owner_id').notNull(), // session ID or user ID
  title: text('title'),
  slug: text('slug').unique(),
  content: jsonb('content').default([]).notNull(), // Block[] as JSONB
  background: jsonb('background'), // BackgroundConfig as JSONB
  publishedContent: jsonb('published_content'), // Snapshot at publish time
  publishedBackground: jsonb('published_background'),
  publishedAt: timestamp('published_at'),
  publishedRevision: integer('published_revision'),
  isPublished: boolean('is_published').default(false).notNull(),
  forkedFromId: text('forked_from_id'),
  serverRevision: integer('server_revision').default(1).notNull(),
  schemaVersion: integer('schema_version').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// =============================================================================
// Feedback
// =============================================================================

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: text('page_id').notNull().references(() => pages.id),
  message: text('message').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productFeedback = pgTable('product_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: text('message').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// =============================================================================
// Types (inferred from schema)
// =============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type ProductFeedback = typeof productFeedback.$inferSelect;

