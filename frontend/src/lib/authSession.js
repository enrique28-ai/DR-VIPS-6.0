// Coordination is document-local. Nothing here is persisted or sent to the server.
let generation = 0;
let revision = 0;
let active = null;
let bootstrap = null;
let appClaimed = false;
let bootstrapOpen = true;
const initialPath = typeof window === "undefined" ? "/" : window.location.pathname;
const initialKey = typeof window === "undefined" ? "default" : window.history.state?.key || "default";
let navigation = null;
let bootstrapGuard = null;
let mutationTail = Promise.resolve();
let mutation = null;
let operation = 0;

export const identityGeneration = () => generation;
export const isCurrentIdentity = (value) => value === generation;
export const invalidateIdentity = () => {
  generation += 1;
  revision += 1;
  active = null;
  bootstrap = null;
  bootstrapOpen = false;
  navigation = null;
  return generation;
};
export const ownsValidation = (record) =>
  record && record.generation === generation && record.revision === revision;

export function validationRound({ location, guard, fresh = false } = {}) {
  if (fresh) {
    revision += 1;
    active = null;
    bootstrapOpen = false;
    bootstrap = null;
    navigation = null;
  }
  let initial = false;
  if (location) {
    const key = `${location.pathname}:${location.key || "default"}`;
    initial = bootstrapOpen && location.pathname === initialPath &&
      (location.key || "default") === initialKey && (!bootstrapGuard || bootstrapGuard === guard);
    if (initial) bootstrapGuard = guard;
    if (!initial) bootstrapOpen = false;
    if (navigation?.key === key && navigation.guard === guard && ownsValidation(navigation.record)) return navigation.record;
    navigation = { key, guard, record: null };
  } else if (!appClaimed) {
    appClaimed = true;
    initial = bootstrapOpen;
  }
  let record = initial && bootstrap && ownsValidation(bootstrap) ? bootstrap : active;
  if (!record || !ownsValidation(record)) {
    record = { generation, revision: ++revision, promise: null };
    active = record;
  }
  if (initial) bootstrap = record;
  if (location) navigation.record = record;
  return record;
}
export function finishValidation(record) {
  if (active === record) active = null;
}

// Serializing cookie-changing writes prevents a delayed logout response clearing
// a newer login cookie in this tab. Replaced operations still finish their HTTP
// write, but cannot publish state or launch a post-write validation.
export const ownsMutation = (owner) => owner.generation === generation && owner.operation === operation;
export function supersedeValidation() {
  revision += 1;
  active = null;
  bootstrap = null;
  bootstrapOpen = false;
  navigation = null;
}
export function queueSessionMutation(work, replaceIdentity = true) {
  if (replaceIdentity) invalidateIdentity();
  else supersedeValidation();
  const owner = { generation, operation: ++operation };
  const record = { owner, promise: null };
  mutation = record;
  record.promise = mutationTail.then(() => work(owner));
  mutationTail = record.promise.catch(() => {});
  record.promise.then(
    () => { if (mutation === record) mutation = null; },
    () => { if (mutation === record) mutation = null; },
  );
  return record;
}
export const pendingSessionMutation = () => mutation;
