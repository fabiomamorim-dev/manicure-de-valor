#!/usr/bin/env node
// Fotografa cada cartão de cartoes.html em 1080x1080 e já salva dentro de
// public/site/posts/, que é de onde o Buffer vai baixar.
//
//   node marca/posts/render.mjs

import playwright from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = playwright;
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const AQUI = resolve(import.meta.dirname);
const SAIDA = resolve(AQUI, "../../public/site/posts");
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
});
const ctx = await navegador.newContext({
  viewport: { width: 1180, height: 1200 }, deviceScaleFactor: 1,
});
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", e => erros.push(e.message));
p.on("requestfailed", r => erros.push("não carregou: " + r.url().slice(0, 70)));

await p.goto("file://" + resolve(AQUI, "cartoes.html"), { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);

const ids = await p.evaluate(() =>
  [...document.querySelectorAll(".cartao")].map(e => e.id));

for (const id of ids) {
  // screenshot do elemento: sai exatamente 1080x1080, sem precisar recortar
  await p.locator("#" + id).screenshot({
    path: resolve(SAIDA, id + ".png"),
  });
  console.log(`  ${id}.png`);
}

console.log(erros.length ? "\nERROS:\n" + erros.join("\n") : "\nconsole limpo");
await navegador.close();
