function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function hasTransientToken(message: string): boolean {
  return [
    "fetch failed",
    "timeout",
    "timed out",
    "connect timeout",
    "und_err_connect_timeout",
    "econnrefused",
    "econnreset",
    "enotfound",
    "eai_again",
    "socket hang up",
    "network error",
    "operation was aborted",
    "aborted"
  ].some((token) => message.includes(token));
}

export function isTransientNetworkError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === "string") {
    return hasTransientToken(lower(error));
  }

  if (error instanceof Error && hasTransientToken(lower(error.message))) {
    return true;
  }

  if (typeof error === "object") {
    const record = error as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    if (hasTransientToken(lower(record.code)) || hasTransientToken(lower(record.errno)) || hasTransientToken(lower(record.message))) {
      return true;
    }

    if (record.cause && record.cause !== error) {
      return isTransientNetworkError(record.cause);
    }
  }

  return false;
}