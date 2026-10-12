/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}
