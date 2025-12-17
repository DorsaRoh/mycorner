import type { GraphQLContext } from './context';
import { getOwnerId, canModifyPage } from './context';
import * as db from '../db';
import type { DbPage, DbUser } from '../db';

interface BlockInput {
  id?: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: Record<string, unknown>;
  effects?: Record<string, unknown>;
  rotation?: number;
}

interface CreatePageInput {
  title?: string;
}

interface UpdatePageInput {
  title?: string;
  blocks?: BlockInput[];
  background?: { mode: string; solid?: { color: string }; gradient?: { type: string; colorA: string; colorB: string; angle: number } };
  localRevision?: number;
  baseServerRevision?: number;
}

interface PublishPageInput {
  blocks: BlockInput[];
  background?: { mode: string; solid?: { color: string }; gradient?: { type: string; colorA: string; colorB: string; angle: number } };
  baseServerRevision: number;
}

interface StoredBlock {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: Record<string, unknown>;
  effects?: Record<string, unknown>;
  rotation?: number;
}

interface StoredBackgroundConfig {
  mode: "solid" | "gradient";
  solid?: { color: string };
  gradient?: { type: "linear" | "radial"; colorA: string; colorB: string; angle: number };
}

interface FormattedUser {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

interface FormattedPage {
  id: string;
  owner: FormattedUser | null;
  title: string | null;
  slug: string | null;
  isPublished: boolean;
  blocks: StoredBlock[];
  background: StoredBackgroundConfig | undefined;
  publishedBlocks: StoredBlock[] | null;
  publishedBackground: StoredBackgroundConfig | undefined;
  publishedAt: string | null;
  publishedRevision: number | null;
  forkedFrom: FormattedPage | null;
  createdAt: string;
  updatedAt: string;
  serverRevision: number;
  schemaVersion: number;
}

function formatUser(user: DbUser | null): FormattedUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
  };
}

async function formatPage(page: DbPage | null): Promise<FormattedPage | null> {
  if (!page) return null;

  const owner = page.user_id ? await db.getUserById(page.user_id) : null;
  
  let blocks: StoredBlock[] = [];
  try {
    blocks = JSON.parse(page.content || '[]');
  } catch (e) {
    console.error('Failed to parse page content:', e);
  }

  let background: StoredBackgroundConfig | undefined;
  if (page.background) {
    try {
      background = JSON.parse(page.background);
    } catch (e) {
      console.error('Failed to parse page background:', e);
    }
  }

  // Parse published content (snapshot)
  let publishedBlocks: StoredBlock[] | null = null;
  if (page.published_content) {
    try {
      publishedBlocks = JSON.parse(page.published_content);
    } catch (e) {
      console.error('Failed to parse published content:', e);
    }
  }

  let publishedBackground: StoredBackgroundConfig | undefined;
  if (page.published_background) {
    try {
      publishedBackground = JSON.parse(page.published_background);
    } catch (e) {
      console.error('Failed to parse published background:', e);
    }
  }

  return {
    id: page.id,
    owner: formatUser(owner),
    title: page.title,
    slug: page.slug,
    isPublished: !!page.is_published,
    blocks,
    background,
    publishedBlocks,
    publishedBackground,
    publishedAt: page.published_at,
    publishedRevision: page.published_revision,
    forkedFrom: page.forked_from_id ? await formatPage(await db.getPageById(page.forked_from_id)) : null,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    serverRevision: page.server_revision,
    schemaVersion: page.schema_version,
  };
}

/**
 * Format a page for public viewing.
 * Uses published_content and published_background instead of draft content.
 * This ensures the public view shows exactly what was published, not live edits.
 */
async function formatPublicPage(page: DbPage | null): Promise<FormattedPage | null> {
  if (!page) return null;
  if (!page.is_published) return null;

  const owner = page.user_id ? await db.getUserById(page.user_id) : null;
  
  // For public view, use published content (or fall back to content for legacy data)
  const contentToParse = page.published_content || page.content;
  let blocks: StoredBlock[] = [];
  try {
    blocks = JSON.parse(contentToParse || '[]');
  } catch (e) {
    console.error('Failed to parse page content:', e);
  }

  // For public view, use published background
  const backgroundToParse = page.published_background || page.background;
  let background: StoredBackgroundConfig | undefined;
  if (backgroundToParse) {
    try {
      background = JSON.parse(backgroundToParse);
    } catch (e) {
      console.error('Failed to parse page background:', e);
    }
  }

  return {
    id: page.id,
    owner: formatUser(owner),
    title: page.title,
    slug: page.slug,
    isPublished: true,
    blocks, // This is the published content
    background, // This is the published background
    publishedBlocks: blocks, // Same as blocks for public view
    publishedBackground: background,
    publishedAt: page.published_at,
    publishedRevision: page.published_revision,
    forkedFrom: page.forked_from_id ? await formatPublicPage(await db.getPageById(page.forked_from_id)) : null,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    serverRevision: page.server_revision,
    schemaVersion: page.schema_version,
  };
}

export const resolvers = {
  Query: {
    me: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.user) return null;
      return formatUser(context.user);
    },

    myPage: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.user) return null;
      // Get user's pages and return the most recently published one
      const pages = await db.getPagesByUserId(context.user.id);
      if (!pages || pages.length === 0) return null;
      
      // Find the most recently published page (by publishedAt timestamp)
      const publishedPages = pages.filter(p => p.is_published && p.published_at);
      if (publishedPages.length > 0) {
        // Sort by publishedAt descending (most recent first)
        publishedPages.sort((a, b) => {
          const dateA = new Date(a.published_at!).getTime();
          const dateB = new Date(b.published_at!).getTime();
          return dateB - dateA;
        });
        return await formatPage(publishedPages[0]);
      }
      
      // No published pages - return null to signal loading starter template
      return null;
    },

    page: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const page = await db.getPageById(args.id);
      if (!page) return null;

      // Only owner can see unpublished pages
      if (!page.is_published && !canModifyPage(context, page.owner_id, page.user_id)) {
        return null;
      }

      return await formatPage(page);
    },

    publicPage: async (_parent: unknown, args: { id: string }) => {
      const page = await db.getPageById(args.id);
      if (!page || !page.is_published) return null;
      // Use formatPublicPage to return published content, not draft
      return await formatPublicPage(page);
    },

    pageByUsername: async (_parent: unknown, args: { username: string }) => {
      const user = await db.getUserByUsername(args.username);
      if (!user) return null;

      // Get user's pages and find the first published one
      const pages = await db.getPagesByUserId(user.id);
      const publishedPage = pages.find(p => p.is_published);
      
      if (!publishedPage) return null;
      // Use formatPublicPage to return published content, not draft
      return await formatPublicPage(publishedPage);
    },

    publicPages: async (_parent: unknown, args: { limit?: number }) => {
      const pages = await db.getPublicPages(args.limit || 12);
      // Use formatPublicPage to return published content, not draft
      return await Promise.all(pages.map(p => formatPublicPage(p))).then(results => results.filter(Boolean));
    },

    usernameAvailable: (_parent: unknown, args: { username: string }) => {
      // Validate format first (a-z, 0-9, _, -)
      const usernameRegex = /^[a-z0-9_-]{3,20}$/;
      if (!usernameRegex.test(args.username.toLowerCase())) {
        return false;
      }
      return !db.isUsernameTaken(args.username.toLowerCase());
    },

    health: () => 'OK',
  },

  Mutation: {
    createPage: async (_parent: unknown, args: { input?: CreatePageInput }, context: GraphQLContext) => {
      // Anonymous creation allowed - use session ID or user ID
      const ownerId = getOwnerId(context);
      const userId = context.user?.id;
      console.log('[createPage] Starting - ownerId:', ownerId, 'userId:', userId, 'title:', args.input?.title);
      
      try {
        const page = await db.createPage(ownerId, args.input?.title, userId);
        console.log('[createPage] DB returned page:', page);
        console.log('[createPage] Page ID:', page?.id);
        console.log('[createPage] Page user_id:', page?.user_id);
        
        if (!page) {
          throw new Error('Database returned null page');
        }
        
        const formattedPage = await formatPage(page);
        console.log('[createPage] Formatted page:', JSON.stringify(formattedPage, null, 2));
        
        if (!formattedPage) {
          throw new Error('Failed to create page - formatting returned null');
        }
        if (!formattedPage.id) {
          throw new Error('Formatted page has no ID');
        }
        return formattedPage;
      } catch (error) {
        console.error('[createPage] Error:', error);
        throw error;
      }
    },

    updatePage: async (
      _parent: unknown,
      args: { id: string; input: UpdatePageInput },
      context: GraphQLContext
    ) => {
      const page = await db.getPageById(args.id);
      if (!page) {
        return {
          page: null,
          conflict: false,
          currentServerRevision: null,
          acceptedLocalRevision: null,
        };
      }

      // Only owner can update
      if (!canModifyPage(context, page.owner_id, page.user_id)) {
        return {
          page: null,
          conflict: false,
          currentServerRevision: page.server_revision,
          acceptedLocalRevision: null,
        };
      }

      // Prepare blocks with IDs
      let blocksJson: string | undefined;
      if (args.input.blocks) {
        const blocks = args.input.blocks.map((block) => ({
          id: block.id || `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: block.type,
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height,
          content: block.content,
          style: block.style,
          effects: block.effects,
          rotation: block.rotation,
        }));
        blocksJson = JSON.stringify(blocks);
      }

      // Prepare background
      let backgroundJson: string | undefined;
      if (args.input.background) {
        const bg = args.input.background;
        if (bg.mode === 'solid' || bg.mode === 'gradient') {
          const background = {
            mode: bg.mode,
            solid: bg.solid,
            gradient: bg.gradient ? {
              type: bg.gradient.type === 'linear' || bg.gradient.type === 'radial' 
                ? bg.gradient.type 
                : 'linear',
              colorA: bg.gradient.colorA,
              colorB: bg.gradient.colorB,
              angle: bg.gradient.angle,
            } : undefined,
          };
          backgroundJson = JSON.stringify(background);
        }
      }

      const result = await db.updatePage(
        args.id, 
        { 
          title: args.input.title, 
          content: blocksJson, 
          background: backgroundJson 
        },
        args.input.baseServerRevision
      );

      if (result.conflict) {
        return {
          page: null,
          conflict: true,
          currentServerRevision: result.page?.server_revision ?? null,
          acceptedLocalRevision: null,
        };
      }

      return {
        page: result.page ? await formatPage(result.page) : null,
        conflict: false,
        currentServerRevision: result.page?.server_revision ?? null,
        acceptedLocalRevision: args.input.localRevision ?? null,
      };
    },

    publishPage: async (
      _parent: unknown, 
      args: { id: string; input: PublishPageInput }, 
      context: GraphQLContext
    ) => {
      // MUST be authenticated to publish
      if (!context.user) {
        throw new Error('Authentication required to publish');
      }

      const page = await db.getPageById(args.id);
      if (!page) {
        return {
          page: null,
          conflict: false,
          currentServerRevision: null,
          publishedRevision: null,
          publishedAt: null,
          publicUrl: null,
        };
      }

      // Check ownership - match either owner_id or user_id
      const isOwner = page.owner_id === context.user.id || page.user_id === context.user.id;
      if (!isOwner) {
        throw new Error('Not authorized to publish this page');
      }

      // Prepare blocks JSON - ensure IDs are present
      const blocks = args.input.blocks.map((block) => ({
        id: block.id || `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: block.type,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        content: block.content,
        style: block.style,
        effects: block.effects,
        rotation: block.rotation,
      }));
      const blocksJson = JSON.stringify(blocks);

      // Prepare background JSON
      let backgroundJson: string | undefined;
      if (args.input.background) {
        const bg = args.input.background;
        if (bg.mode === 'solid' || bg.mode === 'gradient') {
          const background = {
            mode: bg.mode,
            solid: bg.solid,
            gradient: bg.gradient ? {
              type: bg.gradient.type === 'linear' || bg.gradient.type === 'radial' 
                ? bg.gradient.type 
                : 'linear',
              colorA: bg.gradient.colorA,
              colorB: bg.gradient.colorB,
              angle: bg.gradient.angle,
            } : undefined,
          };
          backgroundJson = JSON.stringify(background);
        }
      }

      // Generate slug from username if available
      let slug: string | undefined;
      if (context.user.username) {
        slug = context.user.username;
      }

      // Publish with content snapshot and revision validation
      const result = await db.publishPage({
        id: args.id,
        content: blocksJson,
        background: backgroundJson,
        baseServerRevision: args.input.baseServerRevision,
        slug,
      });

      if (result.conflict) {
        return {
          page: null,
          conflict: true,
          currentServerRevision: result.page?.server_revision ?? null,
          publishedRevision: null,
          publishedAt: null,
          publicUrl: null,
        };
      }

      // Generate public URL - canonical format is /{username}
      // If user has no username, they can't have a public URL yet
      let publicUrl: string | null = null;
      if (result.page && context.user.username) {
        publicUrl = `/${context.user.username}`;
      }

      return {
        page: result.page ? await formatPage(result.page) : null,
        conflict: false,
        currentServerRevision: result.page?.server_revision ?? null,
        publishedRevision: result.publishedRevision,
        publishedAt: result.publishedAt,
        publicUrl,
      };
    },

    forkPage: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      // MUST be authenticated to fork
      if (!context.user) {
        throw new Error('Authentication required to fork');
      }

      const forked = await db.forkPage(args.id, context.user.id, context.user.id);
      return forked ? await formatPage(forked) : null;
    },

    logout: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      return new Promise((resolve) => {
        context.req.logout((err) => {
          if (err) {
            resolve({ success: false, message: 'Logout failed' });
          } else {
            resolve({ success: true, message: 'Logged out successfully' });
          }
        });
      });
    },

    sendFeedback: (
      _parent: unknown,
      args: { pageId: string; message: string; email?: string }
    ) => {
      const page = db.getPageById(args.pageId);
      
      // Only allow feedback on published pages
      if (!page || !page.is_published) {
        return { success: false, message: 'Page not found' };
      }

      const message = args.message.trim();
      if (!message) {
        return { success: false, message: 'Message is required' };
      }

      // Validate email if provided
      const email = args.email?.trim();
      if (email && !email.includes('@')) {
        return { success: false, message: 'Invalid email address' };
      }

      const feedback = db.addFeedback(args.pageId, message, email);
      
      // Log feedback in development
      console.log(`\n💬 New feedback for page ${args.pageId}:`);
      console.log(`   Message: ${feedback.message}`);
      if (feedback.email) console.log(`   Email: ${feedback.email}`);
      console.log('');

      return { success: true, message: 'Thank you for your feedback!' };
    },

    sendProductFeedback: (
      _parent: unknown,
      args: { message: string; email?: string }
    ) => {
      const message = args.message?.trim();
      if (!message) {
        return { success: false, message: 'Message is required' };
      }

      // Validate email if provided
      const email = args.email?.trim();
      if (email && !email.includes('@')) {
        return { success: false, message: 'Invalid email address' };
      }

      const feedback = db.addProductFeedback(message, email);

      // Log feedback in development
      console.log(`\n💬 New product feedback:`);
      console.log(`   Message: ${feedback.message}`);
      if (feedback.email) console.log(`   Email: ${feedback.email}`);
      console.log('');

      return { success: true, message: 'Thank you for your feedback!' };
    },

    setUsername: async (
      _parent: unknown,
      args: { username: string },
      context: GraphQLContext
    ) => {
      // Must be authenticated
      if (!context.user) {
        return { success: false, error: 'Authentication required', username: null };
      }

      // Check if user already has a username
      if (context.user.username) {
        return { success: false, error: 'Username already set', username: context.user.username };
      }

      const result = await db.setUsername(context.user.id, args.username.toLowerCase());
      
      if (!result.success) {
        return { success: false, error: result.error, username: null };
      }

      return { success: true, error: null, username: args.username.toLowerCase() };
    },
  },
};
