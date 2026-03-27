// scripts/translate-copy.mjs
import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const API_URL = "https://translation.googleapis.com/language/translate/v2";

if (!API_KEY) {
  throw new Error("Falta GOOGLE_TRANSLATE_API_KEY");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function protectPlaceholders(text) {
  const matches = [];
  const protectedText = text.replace(/\{\{.*?\}\}/g, (m) => {
    const token = `__PH_${matches.length}__`;
    matches.push(m);
    return token;
  });
  return { protectedText, matches };
}

function restorePlaceholders(text, matches) {
  return text.replace(/__PH_(\d+)__/g, (_, i) => matches[Number(i)] ?? _);
}

async function translateBatch(texts, target) {
  const params = new URLSearchParams();
  for (const text of texts) params.append("q", text);
  params.append("target", target);
  params.append("source", "es");
  params.append("format", "text");
  params.append("key", API_KEY);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Translate error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data.translations.map((t) => t.translatedText);
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (isObject(value)) Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function rebuildTranslated(value, translatedQueue) {
  if (typeof value === "string") return translatedQueue.shift();
  if (Array.isArray(value)) return value.map((v) => rebuildTranslated(v, translatedQueue));
  if (isObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = rebuildTranslated(v, translatedQueue);
    }
    return out;
  }
  return value;
}

async function loadSource() {
  const jsonPath = path.resolve("src/copy/es.json");
  if (await fs.stat(jsonPath).then(() => true).catch(() => false)) {
    return JSON.parse(await fs.readFile(jsonPath, "utf-8"));
  }

  const modulePath = path.resolve("src/copy/es.ts");
  const moduleUrl = new URL(`file://${modulePath}`);
  const { es } = await import(moduleUrl.href);
  return es;
}

async function main() {
  const source = await loadSource();
  const targets = ["ca", "va"];

  for (const target of targets) {
    const rawStrings = collectStrings(source);

    const protectedPayload = rawStrings.map((text) => protectPlaceholders(text));
    const translated = [];

    for (let i = 0; i < protectedPayload.length; i += 100) {
      const chunk = protectedPayload.slice(i, i + 100);
      const translatedChunk = await translateBatch(
        chunk.map((x) => x.protectedText),
        target === "va" ? "ca" : target
      );

      translated.push(
        ...translatedChunk.map((text, idx) =>
          restorePlaceholders(text, chunk[idx].matches)
        )
      );
    }

    const output = rebuildTranslated(source, [...translated]);

    const targetJsonPath = path.resolve(`src/copy/${target}.json`);
    await fs.writeFile(targetJsonPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`Traducido: ${targetJsonPath}`);

    const targetTsPath = path.resolve(`src/copy/${target}.ts`);
    await fs.writeFile(
      targetTsPath,
      `import { es } from './es';\n\nexport const ${target} = ${JSON.stringify(output, null, 2)};\n`,
      "utf-8",
    );
    console.log(`Generado TS: ${targetTsPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});