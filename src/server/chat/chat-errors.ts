export class UnauthorizedError extends Error {
  constructor(message = "登录状态已失效，请重新登录。") {
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
