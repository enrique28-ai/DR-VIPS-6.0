import assert from "node:assert/strict";
import { before, test } from "node:test";

let authRouter;
let avatarLimiter;
let importAvatarFromUrl;
let protect;
let updateAvatar;

before(async () => {
  process.env.PENDING_SECRET ||= "phase-16b5-avatar-route-test-secret";

  const [routes, authMiddleware, rateLimiters, controllers] = await Promise.all([
    import("../../../routes/authRoutes.js"),
    import("../../../middleware/auth.js"),
    import("../../../middleware/rateLimit.js"),
    import("../../authController.js"),
  ]);

  authRouter = routes.default;
  protect = authMiddleware.protect;
  avatarLimiter = rateLimiters.avatarLimiter;
  updateAvatar = controllers.updateAvatar;
  importAvatarFromUrl = controllers.importAvatarFromUrl;
});

function routeFor(path, method) {
  return authRouter.stack
    .map((layer) => layer.route)
    .find((route) => route?.path === path && route?.methods?.[method]);
}

test("avatar routes share one limiter after authentication and before upload or controller work", () => {
  const uploadRoute = routeFor("/profile/avatar", "put");
  const urlImportRoute = routeFor("/profile/avatar-url", "post");

  assert.ok(uploadRoute);
  assert.ok(urlImportRoute);

  const uploadHandlers = uploadRoute.stack.map((layer) => layer.handle);
  const urlImportHandlers = urlImportRoute.stack.map((layer) => layer.handle);

  assert.equal(uploadHandlers.length, 4);
  assert.equal(uploadHandlers[0], protect);
  assert.equal(uploadHandlers[1], avatarLimiter);
  assert.equal(uploadHandlers[2].name, "multerMiddleware");
  assert.equal(uploadHandlers[3], updateAvatar);

  assert.equal(urlImportHandlers.length, 3);
  assert.equal(urlImportHandlers[0], protect);
  assert.equal(urlImportHandlers[1], avatarLimiter);
  assert.equal(urlImportHandlers[2], importAvatarFromUrl);

  assert.equal(uploadHandlers[1], urlImportHandlers[1]);
});
