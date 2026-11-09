
export const getScore = (pwd = "") => {
  let s = 0;
  if (pwd.length >= 6) s++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) s++;
  if (/\d/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return s;
};

export const passwordRules = (pwd = "") => ({
  minLen: pwd.length >= 6,
  hasCase: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd),
  hasNumber: /\d/.test(pwd),
  hasSpecial: /[^A-Za-z0-9]/.test(pwd),
});

export const isStrongPassword = (pwd = "") => {
  const r = passwordRules(pwd);
  return r.minLen && r.hasCase && r.hasNumber && r.hasSpecial;
};