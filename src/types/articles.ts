export type ArticleAsset = {
  id: string;
  key: string;
  eTag: string | null;
  createdAt: string;
  updatedAt?: string;
  size?: number | null;
  url?: string | null;
  userId?: string;
};

export type ArticleAuthor = {
  id: string;
  login: string;
  name: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  githubId?: string | null;
  isCreator?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

export type ArticleRecord = {
  id: string;
  title: string | null;
  text: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnail: ArticleAsset | null;
  media?: ArticleAsset[] | null;
  sources?: ArticleAsset[] | null;
  author?: ArticleAuthor | null;
};

export type ArticleDetail = ArticleRecord & {
  media?: ArticleAsset[] | null;
  sources?: ArticleAsset[] | null;
  viewerCanEdit?: boolean;
};
