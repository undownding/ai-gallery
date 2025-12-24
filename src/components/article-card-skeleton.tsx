export function ArticleCardSkeleton() {
  return (
    <div className="article-card article-card-skeleton">
      <div className="card-media">
        <div className="h-full w-full bg-(--muted)/20" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-3/4 rounded bg-(--muted)/20" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-(--muted)/20" />
            <div className="h-4 w-5/6 rounded bg-(--muted)/20" />
            <div className="h-4 w-4/6 rounded bg-(--muted)/20" />
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <div className="h-3 w-16 rounded bg-(--muted)/20" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-(--muted)/20" />
            <div className="h-3 w-20 rounded bg-(--muted)/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

