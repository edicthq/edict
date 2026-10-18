import { DbClient } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { ApiFailure } from "./api.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx will not change on retry.
      retry: (count, error) => !(error instanceof ApiFailure && error.status < 500) && count < 2,
    },
  },
});

export const db = new DbClient({ queryClient });
