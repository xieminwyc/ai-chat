export class UnauthorizedError extends Error {
  constructor(message = "Authentication is required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this chat") {
    super(message);
    this.name = "ForbiddenError";
  }
}
