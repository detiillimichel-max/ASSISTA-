"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { analisarUrl } = require("./classificar");

const root = path.resolve(__dirname, "../..");
const catalogPath = path.join(root, "catalog.json");
const categoryDir = path.join(root, "catalog");
const concurrency = Math.max(1, Math.min(4, Number(process.env.NSFW_CONCURRENCY || 3)));

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const catalog = await readJson(catalogPath);
  if (!catalog || !Array.isArray(catalog.items) || !catalog.items.length) {
    throw new Error("catalog.json ausente, inválido ou vazio; moderação cancelada.");
  }

  const seen = new Set();
  const unique = catalog.items.filter(item => {
    if (!item || !item.identifier || seen.has(String(item.identifier))) return false;
    seen.add(String(item.identifier));
    return true;
  });
  if (unique.length !== catalog.items.length) {
    console.log("Itens duplicados/inválidos removidos:", catalog.items.length - unique.length);
  }

  console.log("Analisando capas com NSFWJS:", unique.length, "itens; concorrência:", concurrency);
  let passed = 0;
  const decisions = await mapLimit(unique, concurrency, async item => {
    const imageUrl = String(item.thumbnail || "").trim();
    if (!imageUrl) {
      console.log("REJEITADO sem capa:", item.identifier);
      return { item, approved: false, reason: "CAPA_AUSENTE" };
    }
    const result = await analisarUrl(imageUrl);
    if (result.approved) {
      passed++;
      return { item, approved: true, reason: result.reason };
    }
    console.log("REJEITADO pela moderação visual:", item.identifier, result.reason);
    return { item, approved: false, reason: result.reason };
  });

  const approvedIds = new Set(decisions.filter(x => x.approved).map(x => String(x.item.identifier)));
  const approvedItems = unique.filter(x => approvedIds.has(String(x.identifier)));
  if (!approvedItems.length) {
    throw new Error("Nenhum item passou na moderação visual; não publicar catálogo vazio.");
  }

  catalog.items = approvedItems;
  catalog.count = approvedItems.length;
  catalog.visualModeration = {
    engine: "NSFWJS",
    checked: decisions.length,
    approved: approvedItems.length,
    rejected: decisions.length - approvedItems.length,
    checkedAt: new Date().toISOString(),
    scope: "thumbnail-only",
    note: "A aprovação da capa não garante que o vídeo inteiro seja adequado."
  };
  if (Array.isArray(catalog.categories)) {
    catalog.categories = catalog.categories.map(category => ({
      ...category,
      count: approvedItems.filter(item => item.category === category.key).length
    }));
  }
  await writeJson(catalogPath, catalog);

  // Mantém os arquivos de categoria sincronizados com o catálogo moderado.
  const files = await fs.readdir(categoryDir).catch(() => []);
  for (const filename of files.filter(name => name.endsWith(".json"))) {
    const file = path.join(categoryDir, filename);
    let categoryData;
    try { categoryData = await readJson(file); } catch { continue; }
    if (!Array.isArray(categoryData.items)) continue;
    categoryData.items = categoryData.items.filter(item => approvedIds.has(String(item.identifier)));
    categoryData.count = categoryData.items.length;
    categoryData.updatedAt = catalog.updatedAt || new Date().toISOString();
    await writeJson(file, categoryData);
  }

  console.log(JSON.stringify({
    checked: decisions.length,
    approved: passed,
    rejected: decisions.length - passed,
    remaining: approvedItems.length
  }, null, 2));
}

main().catch(error => {
  console.error("ERRO na moderação visual:", error && error.stack || error);
  process.exitCode = 1;
});
