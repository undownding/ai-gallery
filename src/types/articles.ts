export type ArticleAsset = {
  id: string;
  key: string;
  eTag: string;
  createdAt: string;
};

export type ArticleRecord = {
  id: string;
  title: string | null;
  text: string;
  thumbnailImage: ArticleAsset | null;
  media: ArticleAsset[];
  sources: ArticleAsset[];
  createdAt: string;
  updatedAt: string;
  viewerCanEdit: boolean;
};
