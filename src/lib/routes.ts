export const routes = {
  home: () => '/',
  new: () => '/new',
  edit: (pageId: string) => `/edit/${pageId}`,
  public: (pageId: string) => `/p/${pageId}`,
} as const;

export function getPublicUrl(pageId: string): string {
  if (typeof window === 'undefined') return `/p/${pageId}`;
  return `${window.location.origin}/p/${pageId}`;
}

export function isDraftId(id: string): boolean {
  return id.startsWith('draft_');
}

