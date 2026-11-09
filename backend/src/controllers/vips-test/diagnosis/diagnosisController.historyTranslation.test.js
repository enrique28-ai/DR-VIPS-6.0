import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import Diagnosis from "../../../models/Diagnosis.js";
import DiagnosisHistory from "../../../models/DiagnosisHistory.js";
import Patient from "../../../models/Patient.js";

test("authorized history translates recorded text in English and Spanish without filling in legacy fields", async (t) => {
  const requests = [];
  const provider = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    const target = form.get("target_lang");
    const texts = form.getAll("text");
    requests.push({ target, texts });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ translations: texts.map((text) => ({ text: `${target}: ${text}` })) }));
  });
  await new Promise((resolve, reject) => provider.once("error", reject).listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  const oldKey = process.env.DEEPL_API_KEY;
  const oldUrl = process.env.DEEPL_API_URL;
  process.env.DEEPL_API_KEY = "synthetic-history-test";
  process.env.DEEPL_API_URL = `http://127.0.0.1:${provider.address().port}`;
  t.after(() => {
    if (oldKey === undefined) delete process.env.DEEPL_API_KEY;
    else process.env.DEEPL_API_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.DEEPL_API_URL;
    else process.env.DEEPL_API_URL = oldUrl;
  });
  const { getDiagnosisHistoryOne } = await import("../../diagnosisController.js");

  t.mock.method(Diagnosis, "findById", () => ({
    select: () => ({ lean: async () => ({ patient: "patient-id" }) }),
  }));
  t.mock.method(Patient, "exists", async (filter) => {
    assert.deepEqual(filter, { _id: "patient-id", email: "patient@example.test" });
    return { _id: "patient-id" };
  });

  const current = {
    title: "Recorded title", description: "Recorded description",
    medicine: ["Medicine"], treatment: ["Treatment"], operation: ["Operation"],
    createdAt: "2026-01-02T00:00:00Z",
  };
  const legacy = { Diagnostic: "Legacy title", description: "", medicine: [], operation: null };
  t.mock.method(DiagnosisHistory, "findOne", ({ _id, diagnosisId }) => {
    assert.equal(diagnosisId, "diagnosis-id");
    return { populate: () => ({
      lean: async () => ({ _id, snapshot: _id === "current" ? current : legacy }),
    }) };
  });
  const read = async (historyId, lang) => {
    const res = {
      code: 200,
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; },
    };
    await getDiagnosisHistoryOne({
      params: { id: "diagnosis-id", historyId }, query: { lang },
      user: { role: "patient", email: "patient@example.test" },
    }, res);
    assert.equal(res.code, 200);
    return res.body.snapshot;
  };

  for (const [language, target] of [["en", "EN"], ["es", "ES"]]) {
    const translated = await read("current", language);
    assert.deepEqual(translated, {
      ...current,
      title: `${target}: Recorded title`, description: `${target}: Recorded description`,
      medicine: [`${target}: Medicine`], treatment: [`${target}: Treatment`], operation: [`${target}: Operation`],
    });
  }
  assert.deepEqual(await read("legacy", "es"), { ...legacy, Diagnostic: "ES: Legacy title" });
  assert.deepEqual(await read("legacy", ""), legacy);
  assert.equal(current.title, "Recorded title");
  assert.deepEqual(current.operation, ["Operation"]);
  assert.deepEqual(requests.map(({ target }) => target), ["EN", "ES", "ES"]);
  assert.deepEqual(requests[2].texts, ["Legacy title"]);
});
