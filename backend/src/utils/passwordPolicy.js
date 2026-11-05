export const isStrongPassword = (password) => (
  typeof password === "string"
  && password.length >= 6
  && /[a-z]/.test(password)
  && /[A-Z]/.test(password)
  && /\d/.test(password)
  && /[^A-Za-z0-9]/.test(password)
);
