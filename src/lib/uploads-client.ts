export function resolveUploadUrl(key: string | null | undefined) {
  if (!key) return null;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  return `/api/uploads/${encodeURIComponent(key)}`;
}
