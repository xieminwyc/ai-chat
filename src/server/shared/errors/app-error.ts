export type AppErrorInput = {
  code: string;
  message: string;
  httpStatus: number;
  expose?: boolean;
  cause?: unknown;
};

export class AppError extends Error {
  code: string;
  httpStatus: number;
  expose: boolean;

  constructor(input: AppErrorInput) {
    super(input.message, { cause: input.cause });
    this.name = new.target.name;
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.expose = input.expose ?? true;
  }
}

type AppErrorLike = Error & {
  code: string;
  httpStatus: number;
  expose?: boolean;
};

export function isAppErrorLike(error: unknown): error is AppErrorLike {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { httpStatus?: unknown }).httpStatus === "number"
  );
}
