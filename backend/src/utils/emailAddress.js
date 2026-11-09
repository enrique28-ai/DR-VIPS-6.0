const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export const normalizeSingleMailbox = (value) => {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) return null;

  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;

  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local)) return null;
  if (!domain || domain.length > 253) return null;

  const labels = domain.split(".");
  if (labels.some((label) => !DOMAIN_LABEL.test(label))) return null;

  return email;
};
