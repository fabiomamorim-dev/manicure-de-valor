#!/usr/bin/env node
// Renderiza as cenas quadro a quadro e junta com a trilha.
//
//   node marca/video/render.mjs                    # tudo o que já existe
//   node marca/video/render.mjs --ini 0 --fim 23.4 --nome cenas-1a4
//
// Cada quadro é desenhado chamando desenhar(t) na página: nada de animação em
// CSS. O navegador não controla o tempo, nós controlamos — é isso que garante
// que o quadro 418 saia igual hoje e amanhã, e que bata com o segundo 13,93
// da locução.

import playwright from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = playwright;
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const AQUI = resolve(import.meta.dirname);
const dentro = (...p) => resolve(AQUI, ...p);

/* ------------------------------------------------------------- argumentos */
const arg = (nome, padrao) => {
  const i = process.argv.indexOf("--" + nome);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const INI = Number(arg("ini", 0));
const FIM = Number(arg("fim", 23.40));
const FPS = Number(arg("fps", 30));
const NOME = arg("nome", `cenas-${INI}-${FIM}`);
const LARGURA = 1920, ALTURA = 1080;

const QUADROS = dentro("quadros");
const MIX = dentro("mix.wav");
const MP4 = dentro(NOME + ".mp4");

if (!existsSync(MIX)) {
  console.error("falta mix.wav — rode: node marca/video/mixar.mjs");
  process.exit(1);
}

rmSync(QUADROS, { recursive: true, force: true });
mkdirSync(QUADROS, { recursive: true });

/* ---------------------------------------------------------------- desenho */
const total = Math.round((FIM - INI) * FPS);
console.log(`${total} quadros · ${INI}s → ${FIM}s · ${LARGURA}x${ALTURA} @ ${FPS}fps`);

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});
const ctx = await navegador.newContext({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",           // nada de transição vindo do navegador
});
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", e => erros.push(e.message));

await p.goto("file://" + dentro("cenas.html"), { waitUntil: "load" });
// Sem isso o primeiro segundo sai com a fonte do sistema e o vídeo "pula".
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(250);

const inicio = Date.now();
for (let n = 0; n < total; n++) {
  const t = INI + n / FPS;
  await p.evaluate(tt => window.desenhar(tt), t);
  await p.screenshot({
    path: resolve(QUADROS, "q" + String(n).padStart(5, "0") + ".png"),
    animations: "disabled",
  });
  if (n % 60 === 0 || n === total - 1) {
    const feito = n + 1;
    const seg = (Date.now() - inicio) / 1000;
    const falta = seg / feito * (total - feito);
    process.stdout.write(
      `\r  ${feito}/${total}  ${(feito / total * 100).toFixed(0)}%  ` +
      `faltam ~${Math.ceil(falta)}s   `);
  }
}
process.stdout.write("\n");
if (erros.length) console.log("ERROS NA PÁGINA:\n" + erros.join("\n"));
await navegador.close();

/* --------------------------------------------------------------- encoding */
// yuv420p e faststart porque é o que WhatsApp e Instagram aceitam sem
// reconverter; crf 18 é limpo para tipografia sem virar arquivo gigante.
console.log("encodando...");
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-framerate", String(FPS), "-i", resolve(QUADROS, "q%05d.png"),
  "-ss", String(INI), "-t", String(FIM - INI), "-i", MIX,
  "-c:v", "libx264", "-crf", "18", "-preset", "slow",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k",
  "-shortest", MP4,
], { stdio: ["ignore", "inherit", "inherit"] });

const info = execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration,size",
  "-of", "default=nw=1", MP4,
]).toString().trim().split("\n");
console.log(MP4.split("/").pop(), info.join("  "));
