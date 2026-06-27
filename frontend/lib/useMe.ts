"use client";

import { useQuery } from "@tanstack/react-query";

import { authApi } from "@/lib/api/client";

// Shared accessor for the signed-in user. Centralizes the ["me"] query that was
// previously copy-pasted across call sites so the cache key, queryFn, and retry
// policy stay identical everywhere (and `invalidateQueries({ queryKey: ["me"] })`
// keeps working). Returns the raw useQuery result so callers keep `.data`,
// `.error`, `.isPending`, etc. unchanged.
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
}
