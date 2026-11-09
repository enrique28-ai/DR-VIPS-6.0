import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Patient from "../backend/src/models/Patient.js";
import User from "../backend/src/models/User.js";

const database = "dr_vips_local";
const replicaSet = "dr-vips-local";
const uri = `mongodb://127.0.0.1:27018/${database}?replicaSet=${replicaSet}&directConnection=true`;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function seed() {
  const localEnv = dotenv.parse(readFileSync(new URL("../.env", import.meta.url)));
  if (localEnv.NODE_ENV !== "development" || localEnv.MONGO_URI !== uri ||
      (process.env.NODE_ENV !== undefined && process.env.NODE_ENV !== "development") ||
      (process.env.MONGO_URI !== undefined && process.env.MONGO_URI !== uri)) {
    return fail("Seeding requires the unmodified local MongoDB target and development mode from .env.example.");
  }

  await mongoose.connect(uri, {
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 5000,
  });
  const { connection } = mongoose;
  const status = await connection.db.admin().command({ hello: 1 });
  if (connection.name !== database || status.setName !== replicaSet || !status.isWritablePrimary ||
      status.hosts?.length !== 1 || status.hosts[0] !== "localhost:27017") {
    return fail("Start the local single-node replica set with compose.local.yml before seeding.");
  }

  const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of collections) {
    if (!name.startsWith("system.") && await connection.db.collection(name).findOne({}, { projection: { _id: 1 } })) {
      return fail("The local database already contains data. Keep using the existing accounts.");
    }
  }

  await User.createCollection();
  await Patient.createCollection();
  await User.createIndexes();
  await Patient.createIndexes();

  const accounts = [
    { name: "Demo Doctor", email: "doctor@example.test", role: "doctor", isProfessionalVerified: true },
    { name: "Demo Patient", email: "patient@example.test", role: "patient" },
  ].map((account) => ({ ...account, isVerified: true, password: `Dev!${randomBytes(18).toString("hex")}` }));

  await connection.transaction(async (session) => {
    const [doctor, patientUser] = await User.create(accounts, { session, ordered: true });
    await Patient.create([{
      fullname: patientUser.name,
      email: patientUser.email,
      phone: "+12025550101",
      phoneDigits: "12025550101",
      phoneCountry: "United States",
      phoneCountryIso: "US",
      birthDate: new Date("1990-01-15T12:00:00Z"),
      bloodtype: "O+",
      gender: "female",
      organDonor: false,
      bloodDonor: false,
      measurementSystem: "metric",
      heightM: 1.68,
      weightKg: 65,
      country: "United States",
      state: "District of Columbia",
      city: "Washington",
      createdBy: doctor._id,
    }], { session });
  });

  console.log("Created local demo accounts and one pending synthetic patient profile.");
  for (const { role, email, password } of accounts) {
    console.log(`${role}: ${email} / ${password}`);
  }
}

try {
  await seed();
} catch {
  // Never print raw driver errors, which can include connection details.
  fail("Local seed failed. Check that .env exists and the Compose database is healthy.");
} finally {
  await mongoose.disconnect();
}
