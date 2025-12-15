export const routes = {
  home: () => '/',
  new: () => '/new',
  edit: (pageId: string) => `/edit/${pageId}`,
  public: (pageId: string) => `/p/${pageId}`,
  user: (username: string) => `/u/${username}`,
} as const;

export function getPublicUrl(pageId: string, username?: string): string {
  if (username) {
    if (typeof window === 'undefined') return `/u/${username}`;
    return `${window.location.origin}/u/${username}`;
  }
  if (typeof window === 'undefined') return `/p/${pageId}`;
  return `${window.location.origin}/p/${pageId}`;
}

export function isDraftId(id: string): boolean {
  return id.startsWith('draft_');
}

