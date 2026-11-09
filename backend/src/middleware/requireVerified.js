// middleware/requireVerified.js
export const requireVerified = (req, res, next) => {
  // requiere que antes pase por protect (para tener req.user)
  if (!req.user?.isVerified) {
    return res.status(403).json({ error: "Email no verificado. Verifica tu correo para continuar." });
  }
  next();
};
