/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {}

/** A requested item does not exist (or is outside the caller's scope); the API answers 404. */
export class NotFoundError extends UserError {}

export function fail(message: string): never {
  throw new UserError(message);
}

/** Throws a NotFoundError (404 on the REST API). */
export function missing(message: string): never {
  throw new NotFoundError(message);
}
