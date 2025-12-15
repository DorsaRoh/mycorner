import type { GraphQLContext } from './context';
import { getOwnerId, canModifyPage } from './context';
import { store, StoredBlock, StoredBackgroundConfig } from './store';
import { authStore } from '../auth/store';

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

type FormattedPage = {
  id: string;
  owner: { id: string; email: string; displayName?: string; createdAt: string } | null;
  title?: string;
  isPublished: boolean;
  blocks: StoredBlock[];
  background?: StoredBackgroundConfig;
  forkedFrom: FormattedPage | null;
  createdAt: string;
  updatedAt: string;
  serverRevision: number;
  schemaVersion: number;
};

function formatPage(pageId: string): FormattedPage | null {
  const page = store.getPage(pageId);
  if (!page) return null;

  const owner = store.getUser(page.ownerId);
  
  return {
    id: page.id,
    owner: owner ? {
      id: owner.id,
      email: owner.email,
      displayName: owner.displayName,
      createdAt: owner.createdAt.toISOString(),
    } : null,
    title: page.title,
    isPublished: page.isPublished,
    blocks: page.blocks,
    background: page.background,
    forkedFrom: page.forkedFromId ? formatPage(page.forkedFromId) : null,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    serverRevision: page.serverRevision,
    schemaVersion: page.schemaVersion,
  };
}

export const resolvers = {
  Query: {
    me: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.user) return null;
      return {
        id: context.user.id,
        email: context.user.email,
        displayName: context.user.displayName,
        createdAt: context.user.createdAt.toISOString(),
      };
    },

    page: (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const page = store.getPage(args.id);
      if (!page) return null;

      // Only owner can see unpublished pages
      if (!page.isPublished && !canModifyPage(context, page.ownerId)) {
        return null;
      }

      return formatPage(args.id);
    },

    publicPage: (_parent: unknown, args: { id: string }) => {
      const page = store.getPage(args.id);
      if (!page || !page.isPublished) return null;
      return formatPage(args.id);
    },

    publicPages: (_parent: unknown, args: { limit?: number }) => {
      const pages = store.getPublicPages(args.limit || 12);
      return pages.map((page) => formatPage(page.id)).filter(Boolean);
    },

    health: () => 'OK',
  },

  Mutation: {
    requestMagicLink: (
      _parent: unknown,
      args: { email: string },
      context: GraphQLContext
    ) => {
      const email = args.email.toLowerCase().trim();
      
      // Basic email validation
      if (!email || !email.includes('@')) {
        return { success: false, message: 'Invalid email address' };
      }

      // Generate token, passing session ID for page claiming
      const token = authStore.generateToken(email, context.anonymousId);
      const link = `http://localhost:${process.env.PORT || 3000}/auth/verify?token=${token}`;

      // In development, log the link. In production, send email.
      console.log(`\n📧 Magic link for ${email}:\n${link}\n`);

      return { 
        success: true, 
        message: 'Check your email for the login link' 
      };
    },

    createPage: (_parent: unknown, args: { input?: CreatePageInput }, context: GraphQLContext) => {
      // Anonymous creation allowed - use session ID or user ID
      const ownerId = getOwnerId(context);
      const page = store.createPage(ownerId, args.input?.title);
      return formatPage(page.id);
    },

    updatePage: (
      _parent: unknown,
      args: { id: string; input: UpdatePageInput },
      context: GraphQLContext
    ) => {
      const page = store.getPage(args.id);
      if (!page) {
        return {
          page: null,
          conflict: false,
          currentServerRevision: null,
          acceptedLocalRevision: null,
        };
      }

      // Only owner can update
      if (!canModifyPage(context, page.ownerId)) {
        return {
          page: null,
          conflict: false,
          currentServerRevision: page.serverRevision,
          acceptedLocalRevision: null,
        };
      }

      const blocks: StoredBlock[] | undefined = args.input.blocks?.map((block) => ({
        id: block.id || store.generateId('block'),
        type: block.type,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        content: block.content,
        style: block.style,
        effects: block.effects,
      }));

      // Convert background input to StoredBackgroundConfig
      let background: StoredBackgroundConfig | undefined;
      if (args.input.background) {
        const bg = args.input.background;
        if (bg.mode === 'solid' || bg.mode === 'gradient') {
          background = {
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
          } as StoredBackgroundConfig;
        }
      }

      const result = store.updatePage(
        args.id, 
        { title: args.input.title, blocks, background },
        args.input.baseServerRevision
      );

      if (result.conflict) {
        return {
          page: null,
          conflict: true,
          currentServerRevision: result.page?.serverRevision ?? null,
          acceptedLocalRevision: null,
        };
      }

      return {
        page: result.page ? formatPage(result.page.id) : null,
        conflict: false,
        currentServerRevision: result.page?.serverRevision ?? null,
        acceptedLocalRevision: args.input.localRevision ?? null,
      };
    },

    publishPage: (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      // MUST be authenticated to publish
      if (!context.user) {
        throw new Error('Authentication required to publish');
      }

      const page = store.getPage(args.id);
      if (!page) return null;

      // Only owner can publish
      if (page.ownerId !== context.user.id) {
        return null;
      }

      const published = store.publishPage(args.id);
      return published ? formatPage(published.id) : null;
    },

    forkPage: (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      // MUST be authenticated to fork
      if (!context.user) {
        throw new Error('Authentication required to fork');
      }

      const forked = store.forkPage(args.id, context.user.id);
      return forked ? formatPage(forked.id) : null;
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
      const page = store.getPage(args.pageId);
      
      // Only allow feedback on published pages
      if (!page || !page.isPublished) {
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

      const feedback = store.addFeedback(args.pageId, message, email);
      
      // Log feedback in development
      console.log(`\n💬 New feedback for page ${args.pageId}:`);
      console.log(`   Message: ${feedback.message}`);
      if (feedback.email) console.log(`   Email: ${feedback.email}`);
      console.log('');

      return { success: true, message: 'Thank you for your feedback!' };
    },
  },
};
