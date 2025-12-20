export async function safeReadError(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? null;
  } catch {
    try {
      const text = await response.text();
      return text || null;
    } catch {
      return null;
    }
  }
}
