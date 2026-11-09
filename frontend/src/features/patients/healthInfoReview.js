import { useRef, useState } from "react";

export function matchesChildProfile(record, profileId) {
  return record.profileId === profileId ||
    record.snapshot?.sources?.some((source) => source?.id === profileId);
}

export function isHealthInfoAccessError(error) {
  return [403, 404].includes(error?.response?.status);
}

export function useHealthInfoTranslation(source, language, childId) {
  const [view, setView] = useState({ source, language, childId });
  const isCurrent = view.source === source && view.language === language && view.childId === childId;
  if (!isCurrent) setView({ source, language, childId });

  // A callback can publish only to the view that started it. Null means the
  // server no longer returned a record, while undefined clears the translation.
  function setTranslation(snapshot) {
    setView((current) => current === view ? { ...current, snapshot } : current);
  }

  return [isCurrent ? view.snapshot : undefined, setTranslation];
}

export function useHealthInfoDecision(isPending) {
  const inFlight = useRef(false);

  return async (mutation, profileId, expectedUpdatedAt) => {
    if (!profileId || isPending || inFlight.current) return;
    inFlight.current = true;
    try {
      await mutation.mutateAsync(expectedUpdatedAt ? { profileId, expectedUpdatedAt } : profileId);
    } catch {
      // The session-scoped mutation reports decision failures.
    } finally {
      inFlight.current = false;
    }
  };
}
