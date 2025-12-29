// middlewares/recaptcha.js
// Si usas Node 18+, fetch ya existe y puedes quitar esta import.
// import fetch from "node-fetch";

export const verifyRecaptcha = () => async (req, res, next) => {
  try {
    const token = req.body?.recaptchaToken;
    if (!token) return res.status(400).json({ error: "Missing captcha" });

    const params = new URLSearchParams();
    params.append("secret", process.env.RECAPTCHA_SECRET);
    params.append("response", token);
    // params.append("remoteip", req.ip); // opcional

    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: params,
    });
    const data = await r.json();

    if (!data.success) {
      return res.status(400).json({ error: "Captcha failed" });
    }

    // v2 checkbox no requiere score/action
    req.recaptcha = data;
    next();
  } catch (e) {
    return res.status(500).json({ error: "Captcha verification error" });
  }
};
