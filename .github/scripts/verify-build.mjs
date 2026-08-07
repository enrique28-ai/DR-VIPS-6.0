import {
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_FAILURE_CODES = Object.freeze([
  "PUBLIC_HEADERS_MISSING",
  "DIST_HEADERS_MISSING",
  "HEADERS_MISMATCH",
  "HEADERS_INVALID",
  "INDEX_MISSING",
  "INDEX_INVALID",
  "ASSETS_MISSING",
  "ASSET_REFERENCE_INVALID",
  "ASSET_MISSING",
  "ASSET_EMPTY",
  "WRANGLER_MISSING",
  "WRANGLER_WIRING_INVALID",
  "DOCKERFILE_MISSING",
  "BUILD_VERIFICATION_FAILED",
]);

const BUILD_FAILURE_CODE_SET = new Set(BUILD_FAILURE_CODES);

const failure = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const readRegularFile = async (filePath, missingCode) => {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw failure(missingCode);
    return await readFile(filePath);
  } catch (error) {
    if (error?.code === missingCode) throw error;
    throw failure(missingCode);
  }
};

const requireDirectory = async (directoryPath, missingCode) => {
  try {
    const directoryStat = await stat(directoryPath);
    if (!directoryStat.isDirectory()) throw failure(missingCode);
  } catch (error) {
    if (error?.code === missingCode) throw error;
    throw failure(missingCode);
  }
};

const isInside = (parentPath, childPath) => {
  const relative = path.relative(parentPath, childPath);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
};

const stripQueryAndFragment = (reference) => {
  const queryIndex = reference.indexOf("?");
  const fragmentIndex = reference.indexOf("#");
  const indexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const end = indexes.length > 0 ? Math.min(...indexes) : reference.length;
  return reference.slice(0, end);
};

const normalizeReference = (reference) => {
  let decoded;

  try {
    decoded = decodeURIComponent(stripQueryAndFragment(reference));
  } catch {
    throw failure("ASSET_REFERENCE_INVALID");
  }

  return decoded.replaceAll("\\", "/");
};

const isExternalReference = (reference) =>
  reference.startsWith("//") ||
  /^[a-z][a-z\d+.-]*:/i.test(reference);

const extractReferences = (html) => {
  const references = [];
  const attributePattern = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi;

  for (const match of html.matchAll(attributePattern)) {
    references.push(match[2]);
  }

  return references;
};

const resolveLocalAsset = (distDirectory, reference) => {
  const normalized = normalizeReference(reference);

  if (normalized === "" || isExternalReference(normalized)) return null;
  if (normalized.split("/").includes("..")) {
    throw failure("ASSET_REFERENCE_INVALID");
  }

  const relativeReference = normalized.startsWith("/")
    ? normalized.slice(1)
    : normalized.replace(/^\.\//, "");
  const resolved = path.resolve(distDirectory, relativeReference);

  if (!isInside(distDirectory, resolved)) {
    throw failure("ASSET_REFERENCE_INVALID");
  }

  if (!relativeReference.startsWith("assets/")) return null;

  return {
    path: resolved,
    reference: relativeReference,
  };
};

const listFiles = async (directoryPath) => {
  const files = [];
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
};

const verifyHeaders = async (publicHeadersPath, distHeadersPath) => {
  const publicHeaders = await readRegularFile(
    publicHeadersPath,
    "PUBLIC_HEADERS_MISSING",
  );
  const distHeaders = await readRegularFile(
    distHeadersPath,
    "DIST_HEADERS_MISSING",
  );

  if (!publicHeaders.equals(distHeaders)) {
    throw failure("HEADERS_MISMATCH");
  }

  if (publicHeaders.length === 0) {
    throw failure("HEADERS_INVALID");
  }

  const content = publicHeaders.toString("utf8");
  const requiredContent = [
    "Content-Security-Policy:",
    "Strict-Transport-Security:",
    "/assets/*",
    "immutable",
  ];

  if (requiredContent.some((required) => !content.includes(required))) {
    throw failure("HEADERS_INVALID");
  }
};

const verifyAssetsContent = async (assetsDirectory) => {
  let files;
  try {
    files = await listFiles(assetsDirectory);
  } catch {
    throw failure("ASSETS_MISSING");
  }

  if (!files.some((filePath) => path.extname(filePath).toLowerCase() === ".js")) {
    throw failure("ASSETS_MISSING");
  }
};

const verifyIndex = async (indexPath, distDirectory) => {
  const indexBuffer = await readRegularFile(indexPath, "INDEX_MISSING");

  if (indexBuffer.length === 0) throw failure("INDEX_INVALID");

  const html = indexBuffer.toString("utf8");
  if (!/<html\b/i.test(html) || !/<script\b/i.test(html)) {
    throw failure("INDEX_INVALID");
  }

  const localAssets = extractReferences(html)
    .map((reference) => resolveLocalAsset(distDirectory, reference))
    .filter(Boolean);
  const javascriptAssets = localAssets.filter(
    ({ reference }) => path.posix.extname(reference).toLowerCase() === ".js",
  );

  if (javascriptAssets.length === 0) throw failure("INDEX_INVALID");

  for (const asset of localAssets) {
    let assetStat;

    try {
      assetStat = await stat(asset.path);
    } catch {
      throw failure("ASSET_MISSING");
    }

    if (!assetStat.isFile()) throw failure("ASSET_MISSING");
    if (assetStat.size === 0) throw failure("ASSET_EMPTY");
  }
};

const verifyWiring = async (wranglerPath, dockerfilePath) => {
  const wrangler = await readRegularFile(wranglerPath, "WRANGLER_MISSING");
  await readRegularFile(dockerfilePath, "DOCKERFILE_MISSING");

  const wranglerSource = wrangler.toString("utf8");
  const hasAssetsDirectory =
    /["']directory["']\s*:\s*["']\.\/frontend\/dist["']/.test(wranglerSource);
  const hasDockerfile =
    /["']image["']\s*:\s*["']\.\/Dockerfile["']/.test(wranglerSource);

  if (!hasAssetsDirectory || !hasDockerfile) {
    throw failure("WRANGLER_WIRING_INVALID");
  }
};

export const allowlistedCode = (error) =>
  BUILD_FAILURE_CODE_SET.has(error?.code)
    ? error.code
    : "BUILD_VERIFICATION_FAILED";

export async function verifyBuild({ repositoryRoot = process.cwd() } = {}) {
  const frontendDirectory = path.join(repositoryRoot, "frontend");
  const distDirectory = path.join(frontendDirectory, "dist");

  await verifyHeaders(
    path.join(frontendDirectory, "public", "_headers"),
    path.join(distDirectory, "_headers"),
  );
  const assetsDirectory = path.join(distDirectory, "assets");
  await requireDirectory(assetsDirectory, "ASSETS_MISSING");
  await verifyIndex(path.join(distDirectory, "index.html"), distDirectory);
  await verifyAssetsContent(assetsDirectory);
  await verifyWiring(
    path.join(repositoryRoot, "wrangler.jsonc"),
    path.join(repositoryRoot, "Dockerfile"),
  );
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await verifyBuild();
    console.log("[ci-verify]", { event: "build_verified" });
  } catch (error) {
    console.error("[ci-verify]", {
      event: "build_verification_failed",
      code: allowlistedCode(error),
    });
    process.exitCode = 1;
  }
}
