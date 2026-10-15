#!/usr/bin/env node
// Fotografa as telas geradas por telas.mjs, em resolução de celular retina,
// para entrarem nos mockups do vídeo.
//
//   node marca/video/telas.mjs && node marca/video/fotografar.mjs

import playwright from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = playwright;
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TELAS = resolve("marca/video/telas");
const FOTOS = resolve("marca/video/fotos");
mkdirSync(FOTOS, { recursive: true });

const navegador = await chromium.launch({ executablePath: CHROME });
const ctx = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,              // 1170x2532, que é retina de celular
});
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", e => erros.push(e.message));

const abrir = async (arquivo) => {
  await p.goto("file://" + resolve(TELAS, arquivo), { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(400);
};

const tirar = async (nome, opcoes = {}) => {
  await p.screenshot({ path: resolve(FOTOS, nome + ".png"), ...opcoes });
  console.log("  " + nome);
};

/* --------------------------------------------------------------- a agenda */

console.log("painel");
await abrir("agenda.html");
await tirar("agenda-topo");                                  // Hoje, com o cabeçalho
await p.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find(e => /PRÓXIMOS/i.test(e.textContent));
  if (h) h.scrollIntoView({ block: "start" });
});
await p.waitForTimeout(300);
await tirar("agenda-proximos");
await p.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find(e => /VOLTAR/i.test(e.textContent));
  if (h) h.scrollIntoView({ block: "start" });
});
await p.waitForTimeout(300);
await tirar("agenda-voltar");
await tirar("agenda-inteira", { fullPage: true });

console.log("clientes");
await abrir("clientes.html");
await tirar("clientes");

/* ------------------------------------------------- a página de agendamento */

console.log("agendar");
await abrir("agendar.html");
await tirar("agendar-1-servico");

await p.click('[data-servico="Unhas em gel"]');
await p.waitForTimeout(500);
await tirar("agendar-2-dia");

await p.click(".dias .dia:nth-child(2)");
await p.waitForTimeout(900);          // a consulta de horários falha em file://
await tirar("agendar-3-hora");        // e a grade local assume, que serve

const temHora = await p.$("[data-hora]");
if (temHora) {
  await p.click("[data-hora]");
  await p.waitForTimeout(400);
  await tirar("agendar-4-dados");
  await p.fill("#fNome", "Marina Souza");
  await p.fill("#fFone", "41988887777");
  const bairro = await p.$("#fBairro");
  if (bairro && !(await p.getAttribute("#wrapBairro", "hidden"))) {
    await p.selectOption("#fBairro", { index: 1 });
  }
  await p.click("#revisar");
  await p.waitForTimeout(400);
  await tirar("agendar-5-resumo");
}

/* ------------------------------------------------------------------ o site */

console.log("site");
await abrir("site.html");
await tirar("site-topo");
await tirar("site-inteiro", { fullPage: true });

console.log(erros.length ? "\nERROS:\n" + erros.join("\n") : "\nconsole limpo");
await navegador.close();
