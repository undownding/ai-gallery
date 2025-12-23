// export type ArticleAssetPayload = Pick<Upload, "id" | "key" | "eTag" | "createdAt">;
export type ArticleAssetPayload = {
    id: string,
    key: string,
    eTag: string,
    createdAt: string
}

// export type ArticleAuthorPayload = Pick<User, "id" | "login" | "name" | "avatarUrl">;
export type ArticleAuthorPayload = {
    id: string,
    login: string,
    name: string,
    avatarUrl: string | null
}

export type ArticleResponsePayload = {
  id: string;
  title: string | null;
  text: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailImage: ArticleAssetPayload | null;
  media: ArticleAssetPayload[];
  sources: ArticleAssetPayload[];
  viewerCanEdit: boolean;
  author: ArticleAuthorPayload | null;
};
