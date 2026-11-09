import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { identityGeneration, isCurrentIdentity } from "./authSession.js";
import { useAuthStore } from "../stores/authStore.js";

const superseded = () => Object.assign(new Error("Session changed"), { code: "AUTH_SUPERSEDED" });
const owns = (operation) => isCurrentIdentity(operation.generation) && useAuthStore.getState().isAuthenticated;

async function withSession(operation, work) {
  while (useAuthStore.getState().isCheckingAuth) {
    await new Promise((resolve) => {
      const unsubscribe = useAuthStore.subscribe((state) => {
        if (!state.isCheckingAuth) { unsubscribe(); resolve(); }
      });
    });
  }
  if (!owns(operation)) throw superseded();
  // No await between the final gate and work: another hint may arrive as soon
  // as this task yields, even after a previous validation resolved.
  return work();
}

const callbacksFor = (callbacks) => {
  if (!callbacks) return undefined;
  return {
    ...callbacks,
    onSuccess: (data, operation, context, mutationContext) => {
      if (owns(operation)) return callbacks.onSuccess?.(data, operation.variables, context, mutationContext);
    },
    onError: (error, operation, context, mutationContext) => {
      if (owns(operation)) return callbacks.onError?.(error, operation.variables, context, mutationContext);
    },
    onSettled: (data, error, operation, context, mutationContext) => {
      if (owns(operation)) return callbacks.onSettled?.(data, error, operation.variables, context, mutationContext);
    },
  };
};

// Each invocation owns its epoch, including retries and detached callbacks.
// Only original variables reach the API and original contexts reach callers.
export function useSessionMutation(options) {
  const result = useMutation({
    ...options,
    onMutate: (operation, mutationContext) => withSession(operation, async () => {
      const context = await options.onMutate?.(operation.variables, {
        ...mutationContext,
        // Optimistic callbacks that await work must check again before writing.
        withSession: (work) => withSession(operation, work),
      });
      if (!owns(operation)) throw superseded();
      return context;
    }),
    mutationFn: (operation, mutationContext) => withSession(operation, async () => {
      const data = await options.mutationFn(operation.variables, mutationContext);
      if (!owns(operation)) throw superseded();
      return data;
    }),
    onSuccess: (data, operation, context, mutationContext) => {
      if (owns(operation)) return options.onSuccess?.(data, operation.variables, context, mutationContext);
    },
    onError: (error, operation, context, mutationContext) => {
      if (owns(operation)) return options.onError?.(error, operation.variables, context, mutationContext);
    },
    onSettled: (data, error, operation, context, mutationContext) => {
      if (owns(operation)) return options.onSettled?.(data, error, operation.variables, context, mutationContext);
    },
  });
  const { mutate, mutateAsync } = result;
  const ownedMutate = useCallback((variables, callbacks) => mutate(
    { variables, generation: identityGeneration() }, callbacksFor(callbacks),
  ), [mutate]);
  const ownedMutateAsync = useCallback((variables, callbacks) => mutateAsync(
    { variables, generation: identityGeneration() }, callbacksFor(callbacks),
  ), [mutateAsync]);
  return { ...result, variables: result.variables?.variables, mutate: ownedMutate, mutateAsync: ownedMutateAsync };
}
