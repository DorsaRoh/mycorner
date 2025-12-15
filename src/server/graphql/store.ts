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

// Block style - roundness, shadow, and text styling
export interface StoredBlockStyle {
  borderRadius?: number;
  shadowStrength?: number;
  shadowSoftness?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  // Text styling
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textOpacity?: number;
}

export interface StoredBlockEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hueShift?: number;
  blur?: number;
}

export interface StoredBlock {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: StoredBlockStyle;
  effects?: StoredBlockEffects;
}

export interface StoredBackgroundSolid {
  color: string;
}

export interface StoredBackgroundGradient {
  type: "linear" | "radial";
  colorA: string;
  colorB: string;
  angle: number;
}

export interface StoredBackgroundConfig {
  mode: "solid" | "gradient";
  solid?: StoredBackgroundSolid;
  gradient?: StoredBackgroundGradient;
}

export interface StoredPage {
  id: string;
  ownerId: string; // Can be a user ID or anonymous session ID
  title?: string;
  isPublished: boolean;
  blocks: StoredBlock[];
  background?: StoredBackgroundConfig;
  forkedFromId?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Server revision number, increments on each successful save */
  serverRevision: number;
  /** Schema version for forward compatibility */
  schemaVersion: number;
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
      serverRevision: 1,
      schemaVersion: 1,
    };
    this.pages.set(id, page);
    return page;
  }

  /**
   * Update page with revision checking
   * @returns { page, conflict } - page if success, conflict=true if revision mismatch
   */
  updatePage(
    id: string, 
    updates: { title?: string; blocks?: StoredBlock[]; background?: StoredBackgroundConfig },
    baseServerRevision?: number
  ): { page?: StoredPage; conflict: boolean } {
    const page = this.pages.get(id);
    if (!page) return { conflict: false };

    if (baseServerRevision !== undefined && baseServerRevision !== page.serverRevision) {
      return { page, conflict: true };
    }

    if (updates.title !== undefined) page.title = updates.title;
    if (updates.blocks !== undefined) page.blocks = updates.blocks;
    if (updates.background !== undefined) page.background = updates.background;
    page.updatedAt = new Date();
    page.serverRevision += 1;
    
    return { page, conflict: false };
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
      background: source.background ? { ...source.background } : undefined,
      forkedFromId: sourceId,
      createdAt: now,
      updatedAt: now,
      serverRevision: 1,
      schemaVersion: 1,
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
