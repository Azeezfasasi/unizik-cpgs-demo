export type CellError = { sheet: string; row: number; column: string; message: string };

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: CellError[];
  warnings?: string[];
  /** Arbitrary payload for the client, e.g. a one-time secret shown once. */
  data?: Record<string, string>;
  /** HTTP status for the REST API when the action fails (401, 403, 409, 422, 500). */
  status?: number;
};

export const initialState: ActionState = {};
