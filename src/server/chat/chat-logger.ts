export function logInfo(event: string, details: Record<string, unknown> = {}) {
  console.log(`[chat-api] ${event}`, details);
}

export function logError(
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  console.error(`[chat-api] ${event}`, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function getDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}
