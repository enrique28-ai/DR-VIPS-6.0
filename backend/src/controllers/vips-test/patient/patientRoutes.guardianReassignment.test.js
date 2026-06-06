import assert from "node:assert/strict";
import { test } from "node:test";

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

test("guardian reassignment route is before generic id routes and doctor verified write protected", () => {
  const guardianRoute = routeFor("/:id/guardian", "patch");
  const getByIdRoute = routeFor("/:id", "get");
  const updateByIdRoute = routeFor("/:id", "put");

  assert.ok(guardianRoute);
  assert.ok(getByIdRoute);
  assert.ok(updateByIdRoute);
  assert.ok(guardianRoute.index < getByIdRoute.index);
  assert.ok(guardianRoute.index < updateByIdRoute.index);

  const handlers = guardianRoute.route.stack.map((layer) => layer.handle);
  assert.equal(handlers.length, 5);
  assert.equal(handlers[0].name, "protect");
  assert.equal(handlers[1].name, "requireVerified");
  assert.equal(typeof handlers[3].resetKey, "function");
  assert.equal(typeof handlers[3].getKey, "function");
  assert.equal(handlers[4].name, "reassignPatientGuardian");

  const unverifiedRes = makeRes();
  let nextCalled = false;
  handlers[1]({ user: { isVerified: false } }, unverifiedRes, () => {
    nextCalled = true;
  });
  assert.equal(unverifiedRes.statusCode, 403);
  assert.equal(nextCalled, false);

  const patientRoleRes = makeRes();
  nextCalled = false;
  handlers[2]({ user: { isVerified: true, role: "patient" } }, patientRoleRes, () => {
    nextCalled = true;
  });
  assert.equal(patientRoleRes.statusCode, 403);
  assert.deepEqual(patientRoleRes.body, { error: "Insufficient role" });
  assert.equal(nextCalled, false);

  const doctorRoleRes = makeRes();
  nextCalled = false;
  handlers[2]({ user: { isVerified: true, role: "doctor" } }, doctorRoleRes, () => {
    nextCalled = true;
  });
  assert.equal(doctorRoleRes.statusCode, 200);
  assert.equal(nextCalled, true);
});
