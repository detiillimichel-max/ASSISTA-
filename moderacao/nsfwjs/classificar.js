"use strict";

const tf = require("@tensorflow/tfjs-node");
const nsfwjs = require("nsfwjs");

let modelPromise;

function getModel() {
  if (!modelPromise) {
    modelPromise = nsfwjs.load();
    modelPromise.catch(() => { modelPromise = undefined; });
  }
  return modelPromise;
}

async function fetchImageBuffer(url, maxBytes = 8 * 1024 * 1024) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["archive.org", "www.archive.org"].includes(parsed.hostname)) {
    throw new Error("URL de imagem fora da lista permitida");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ASSISTA-Plus-Family-Moderation/1.0" }
    });
    if (!response.ok) throw new Error("Imagem HTTP " + response.status);
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) throw new Error("Resposta não é uma imagem");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maxBytes) throw new Error("Imagem acima do limite de tamanho");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) throw new Error("Imagem vazia ou acima do limite");
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

function decide(predictions) {
  if (!Array.isArray(predictions) || !predictions.length) {
    return { approved: false, reason: "PREDICOES_INVALIDAS" };
  }
  const scores = Object.fromEntries(predictions.map(p => [p.className, Number(p.probability)]));
  for (const p of predictions) {
    if (!Number.isFinite(Number(p.probability)) || p.probability < 0 || p.probability > 1) {
      return { approved: false, reason: "PREDICAO_INVALIDA", scores };
    }
  }
  // Limites conservadores iniciais; devem ser calibrados com exemplos reais.
  if ((scores.Porn ?? 0) >= 0.15) return { approved: false, reason: "PORN", scores };
  if ((scores.Hentai ?? 0) >= 0.15) return { approved: false, reason: "HENTAI", scores };
  if ((scores.Sexy ?? 0) >= 0.35) return { approved: false, reason: "SEXY", scores };
  return { approved: true, reason: "PASSOU_LIMIARES", scores };
}

async function analisarImagemBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { approved: false, reason: "IMAGEM_AUSENTE" };
  }
  let tensor;
  try {
    const model = await getModel();
    tensor = tf.node.decodeImage(buffer, 3);
    if (tensor.shape.length !== 3 || tensor.shape[0] < 1 || tensor.shape[1] < 1) {
      return { approved: false, reason: "IMAGEM_INVALIDA" };
    }
    const predictions = await model.classify(tensor);
    return decide(predictions);
  } catch (error) {
    return {
      approved: false,
      reason: "ANALISE_INDISPONIVEL",
      error: String(error && error.message || error).slice(0, 180)
    };
  } finally {
    if (tensor) tensor.dispose();
  }
}

async function analisarUrl(url) {
  try {
    return await analisarImagemBuffer(await fetchImageBuffer(url));
  } catch (error) {
    return {
      approved: false,
      reason: "IMAGEM_INDISPONIVEL",
      error: String(error && error.message || error).slice(0, 180)
    };
  }
}

module.exports = { analisarImagemBuffer, analisarUrl, decide };
