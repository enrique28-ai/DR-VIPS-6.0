import assert from "node:assert/strict";
import { test } from "node:test";

import { readLimiter, writeLimiter } from "../../../middleware/rateLimit.js";
import patientRouter from "../../../routes/patientRoutes.js";

function routeFor(path, method) {
  return patientRouter.stack
    .map((layer, index) => ({ index, route: layer.route }))
    .find(({ route }) => route?.path === path && route?.methods?.[method]);
}

function makeRes() {
  return {
    body: undefined,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function assertRoleMiddleware(handler, allowedRole, deniedRole) {
  let nextCalled = false;
  const deniedRes = makeRes();
  handler(
    { user: { isVerified: true, role: deniedRole } },
    deniedRes,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, false);
  assert.equal(deniedRes.statusCode, 403);
  assert.deepEqual(deniedRes.body, { error: "Insufficient role" });

  nextCalled = false;
  const allowedRes = makeRes();
  handler(
    { user: { isVerified: true, role: allowedRole } },
    allowedRes,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, true);
  assert.equal(allowedRes.statusCode, 200);
}

test("patient access request routes are authenticated, verified, role-scoped, and ordered before generic patient ids", () => {
  const routeCases = [
    {
      path: "/import/:id",
      method: "post",
      role: "doctor",
      deniedRole: "patient",
      controller: "importPatient",
      limiter: writeLimiter,
    },
    {
      path: "/access-requests/mine",
      method: "get",
      role: "doctor",
      deniedRole: "patient",
      controller: "getDoctorPatientAccessRequests",
      limiter: readLimiter,
    },
    {
      path: "/access-requests/:patientId",
      method: "post",
      role: "doctor",
      deniedRole: "patient",
      controller: "createPatientAccessRequest",
      limiter: writeLimiter,
    },
    {
      path: "/me/access-requests",
      method: "get",
      role: "patient",
      deniedRole: "doctor",
      controller: "getMyPatientAccessRequests",
      limiter: readLimiter,
    },
    {
      path: "/me/access-requests/:requestId/approve",
      method: "post",
      role: "patient",
      deniedRole: "doctor",
      controller: "approvePatientAccessRequest",
      limiter: writeLimiter,
    },
    {
      path: "/me/access-requests/:requestId/reject",
      method: "post",
      role: "patient",
      deniedRole: "doctor",
      controller: "rejectPatientAccessRequest",
      limiter: writeLimiter,
    },
  ];
  const genericGet = routeFor("/:id", "get");
  const genericPut = routeFor("/:id", "put");

  assert.ok(genericGet);
  assert.ok(genericPut);

  for (const routeCase of routeCases) {
    const matched = routeFor(routeCase.path, routeCase.method);
    assert.ok(matched, `${routeCase.method.toUpperCase()} ${routeCase.path} must exist`);
    assert.ok(matched.index < genericGet.index);
    assert.ok(matched.index < genericPut.index);

    const handlers = matched.route.stack.map((layer) => layer.handle);
    assert.equal(handlers.length, 5);
    assert.equal(handlers[0].name, "protect");
    assert.equal(handlers[1].name, "requireVerified");
    assert.equal(typeof handlers[3].resetKey, "function");
    assert.equal(typeof handlers[3].getKey, "function");
    assert.equal(handlers[3], routeCase.limiter);
    assert.equal(handlers[4].name, routeCase.controller);

    const unverifiedRes = makeRes();
    let nextCalled = false;
    handlers[1]({ user: { isVerified: false } }, unverifiedRes, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(unverifiedRes.statusCode, 403);

    assertRoleMiddleware(handlers[2], routeCase.role, routeCase.deniedRole);
  }
});
