/**
 * In-memory data store for development.
 * Replace with database integration (e.g., Prisma) for production.
 */

export interface StoredUser {
  id: string;
  email: string;
  displayName?: string;
  createdAt: Date;
}

export type FrameStyle = 'none' | 'polaroid' | 'gallery_gold' | 'simple_border' | 'soft_shadow' | 'pixel';

export interface StoredGradientOverlay {
  strength: number;
  angle: number;
  colors: [string, string];
}

export interface StoredBlockEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hueShift?: number;
  pixelate?: number;
  dither?: number;
  noise?: number;
  grainSize?: number;
  blur?: number;
  gradientOverlay?: StoredGradientOverlay;
}

export interface StoredBlock {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  frameStyle?: FrameStyle;
  effects?: StoredBlockEffects;
}

export interface StoredBackgroundAudio {
  url: string;
  volume: number;
  loop: boolean;
  enabled: boolean;
}

export interface StoredPage {
  id: string;
  ownerId: string; // Can be a user ID or anonymous session ID
  title?: string;
  isPublished: boolean;
  blocks: StoredBlock[];
  backgroundAudio?: StoredBackgroundAudio;
  forkedFromId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredFeedback {
  id: string;
  pageId: string;
  message: string;
  email?: string;
  createdAt: Date;
}

class Store {
  private users: Map<string, StoredUser> = new Map();
  private usersByEmail: Map<string, string> = new Map(); // email -> user id
  private pages: Map<string, StoredPage> = new Map();
  private feedback: Map<string, StoredFeedback[]> = new Map(); // pageId -> feedback[]
  private idCounter = 1;

  generateId(prefix: string): string {
    return `${prefix}_${this.idCounter++}`;
  }

  // User operations
  getUser(id: string): StoredUser | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): StoredUser | undefined {
    const userId = this.usersByEmail.get(email.toLowerCase());
    return userId ? this.users.get(userId) : undefined;
  }

  createUser(email: string): StoredUser {
    const existing = this.getUserByEmail(email);
    if (existing) return existing;

    const id = this.generateId('user');
    const user: StoredUser = {
      id,
      email: email.toLowerCase(),
      createdAt: new Date(),
    };
    this.users.set(id, user);
    this.usersByEmail.set(email.toLowerCase(), id);
    return user;
  }

  // Page operations
  getPage(id: string): StoredPage | undefined {
    return this.pages.get(id);
  }

  createPage(ownerId: string, title?: string): StoredPage {
    const id = this.generateId('page');
    const now = new Date();
    const page: StoredPage = {
      id,
      ownerId,
      title,
      isPublished: false,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(id, page);
    return page;
  }

  updatePage(id: string, updates: { title?: string; blocks?: StoredBlock[]; backgroundAudio?: StoredBackgroundAudio }): StoredPage | undefined {
    const page = this.pages.get(id);
    if (!page) return undefined;

    if (updates.title !== undefined) {
      page.title = updates.title;
    }
    if (updates.blocks !== undefined) {
      page.blocks = updates.blocks;
    }
    if (updates.backgroundAudio !== undefined) {
      page.backgroundAudio = updates.backgroundAudio;
    }
    page.updatedAt = new Date();
    return page;
  }

  publishPage(id: string): StoredPage | undefined {
    const page = this.pages.get(id);
    if (!page) return undefined;

    page.isPublished = true;
    page.updatedAt = new Date();
    return page;
  }

  forkPage(sourceId: string, newOwnerId: string): StoredPage | undefined {
    const source = this.pages.get(sourceId);
    if (!source || !source.isPublished) return undefined;

    const id = this.generateId('page');
    const now = new Date();
    const forked: StoredPage = {
      id,
      ownerId: newOwnerId,
      title: source.title ? `${source.title} (fork)` : undefined,
      isPublished: false,
      blocks: source.blocks.map((block) => ({
        ...block,
        id: this.generateId('block'),
      })),
      backgroundAudio: source.backgroundAudio ? { ...source.backgroundAudio } : undefined,
      forkedFromId: sourceId,
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(id, forked);
    return forked;
  }

  /**
   * Transfer anonymous pages to authenticated user
   */
  claimAnonymousPages(anonymousId: string, userId: string): void {
    for (const page of this.pages.values()) {
      if (page.ownerId === anonymousId && !page.isPublished) {
        page.ownerId = userId;
      }
    }
  }

  /**
   * Check if owner is anonymous (session-based) vs authenticated user
   */
  isAnonymousOwner(ownerId: string): boolean {
    return ownerId.startsWith('anon_');
  }

  // Feedback operations
  addFeedback(pageId: string, message: string, email?: string): StoredFeedback {
    const id = this.generateId('feedback');
    const feedbackItem: StoredFeedback = {
      id,
      pageId,
      message,
      email,
      createdAt: new Date(),
    };

    const existing = this.feedback.get(pageId) || [];
    existing.push(feedbackItem);
    this.feedback.set(pageId, existing);

    return feedbackItem;
  }

  getFeedbackForPage(pageId: string): StoredFeedback[] {
    return this.feedback.get(pageId) || [];
  }

  /**
   * Get published pages, ordered by newest first
   */
  getPublicPages(limit?: number): StoredPage[] {
    const publicPages: StoredPage[] = [];
    for (const page of this.pages.values()) {
      if (page.isPublished) {
        publicPages.push(page);
      }
    }
    // Sort by updatedAt descending (newest first)
    publicPages.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return limit ? publicPages.slice(0, limit) : publicPages;
  }
}

export const store = new Store();
