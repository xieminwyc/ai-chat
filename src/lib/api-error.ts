export type ApiErrorObject = {
  code?: string;
  message?: string;
};

export type ApiErrorPayload = {
  error?: string | ApiErrorObject;
};

export function getApiError(payload?: ApiErrorPayload | null): ApiErrorObject | null {
  if (!payload?.error) {
    return null;
  }

  if (typeof payload.error === "string") {
    return {
      message: payload.error,
    };
  }

  return {
    code: payload.error.code,
    message: payload.error.message,
  };
}

export function getApiErrorMessage(
  payload: ApiErrorPayload | null | undefined,
  fallbackMessage: string,
) {
  return getApiError(payload)?.message ?? fallbackMessage;
}
