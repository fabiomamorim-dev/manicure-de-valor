#!/usr/bin/env node
// Monta o corte curto para feed, de ~20 segundos.
//
//   node marca/video/curto.mjs            # 9:16, para reels e TikTok
//   node marca/video/curto.mjs --deitado  # 16:9
//
// Não é um vídeo novo: são quatro pedaços da MESMA linha do tempo, colados.
// Áudio e imagem são fatiados pelos mesmos segundos, então continuam batendo
// sem eu ter que re-sincronizar nada. A cama e os efeitos são remontados por
// cima, contínuos, senão a música cortaria junto e ficaria picotado.

import playwright from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = playwright;
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { EFEITOS } from "./efeitos.mjs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const AQUI = resolve(import.meta.dirname);
const dentro = (...p) => resolve(AQUI, ...p);

const DEITADO = process.argv.includes("--deitado");
const LARGURA = DEITADO ? 1920 : 1080, ALTURA = DEITADO ? 1080 : 1920;
const FPS = 30;
const NOME = DEITADO ? "manicure-de-valor-curto-169" : "manicure-de-valor-curto";

// A dor, a virada, a prova e a marca. Os limites são os mesmos de cortes.json,
// medidos na transcrição — cada pedaço começa e termina em pausa de fala.
// Os cortes caem dentro das pausas medidas com silencedetect na própria
// locução, não nas fronteiras redondas de cortes.json: 42.45 porque a fala
// seguinte começa em 42.506, e cortar em 42.35 traria 0.15s de cena anterior.
const TRECHOS = [
  { de: 0.00,  ate: 4.33,  diz: "Terça-feira. Sete mensagens perguntando preço e horário." },
  { de: 20.36, ate: 23.40, diz: "No Manicure de Valor, a cliente marca sozinha." },
  { de: 42.45, ate: 50.09, diz: "E quando passa do tempo, a agenda te avisa..." },
  { de: 50.09, ate: 55.48, diz: "Seu site e sua agenda. Trinta e nove e noventa..." },
];

// Pedaços que pertencem a cenas que ficaram de fora e apareceriam só como
// resto meio apagado no primeiro quadro de um trecho: a tela de clientes
// (cena 7) e a tarja, que no corte longo diz "2 minutos para cadastrar".
const ESCONDER = ["nota", "apClientes"];

/* ------------------------------------------------ linha do tempo nova */

let acumulado = 0;
for (const t of TRECHOS) { t.novoDe = acumulado; acumulado += t.ate - t.de; }
const TOTAL = acumulado;

// de segundo do corte para segundo do original
const original = (tNovo) => {
  for (const t of TRECHOS) {
    if (tNovo < t.novoDe + (t.ate - t.de)) return t.de + (tNovo - t.novoDe);
  }
  const u = TRECHOS[TRECHOS.length - 1];
  return u.ate - 0.001;
};

console.log(`corte de ${TOTAL.toFixed(2)}s em ${TRECHOS.length} pedaços:`);
for (const t of TRECHOS) {
  console.log(`  ${t.novoDe.toFixed(2).padStart(5)} → ${(t.novoDe + t.ate - t.de).toFixed(2).padStart(5)}` +
              `   (original ${t.de}–${t.ate})  ${t.diz}`);
}

/* ------------------------------------------------------------- áudio */

const LOCUCAO = dentro("locucao-v1.mp3");
const MIX = dentro("mix-curto.wav");

// efeitos que caem dentro de algum pedaço, com o tempo remapeado
const efeitosCurto = [];
for (const [som, t, vol] of EFEITOS) {
  for (const p of TRECHOS) {
    if (t >= p.de && t < p.ate) {
      efeitosCurto.push([som, p.novoDe + (t - p.de), vol]);
      break;
    }
  }
}
// Whoosh só nas emendas de verdade — onde um trecho não continua o anterior.
// O último par (50.09) é contínuo no original e já tem som próprio ali.
TRECHOS.forEach((p, i) => {
  if (i > 0 && Math.abs(p.de - TRECHOS[i - 1].ate) > 0.01) {
    efeitosCurto.push(["whoosh", p.novoDe - 0.04, 0.30]);
  }
});

const sons = [...new Set(efeitosCurto.map(e => e[0]))];
const entradas = [
  ...TRECHOS.map(() => LOCUCAO),            // uma entrada por pedaço de fala
  dentro("sons/cama.wav"),
  ...sons.map(s => dentro(`sons/${s}.wav`)),
];
for (const a of [...new Set(entradas)]) {
  if (!existsSync(a)) { console.error(`falta ${a}`); process.exit(1); }
}
const iCama = TRECHOS.length;
const iSom = s => TRECHOS.length + 1 + sons.indexOf(s);
const FMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

const linhas = [
  // cada pedaço de locução recortado e emendado em sequência
  ...TRECHOS.map((p, i) =>
    `[${i}:a]atrim=${p.de}:${p.ate},asetpts=PTS-STARTPTS,${FMT}[f${i}]`),
  `${TRECHOS.map((_, i) => `[f${i}]`).join("")}concat=n=${TRECHOS.length}:v=0:a=1,asplit=2[narr][chave]`,

  // a cama NÃO é fatiada: toca inteira por baixo das emendas, que é o que
  // disfarça o corte
  `[${iCama}:a]${FMT},atrim=0:${TOTAL.toFixed(2)},volume=0.26,` +
    `afade=t=in:st=0:d=1.2,afade=t=out:st=${(TOTAL - 2.0).toFixed(2)}:d=2.0[cama0]`,
  `[cama0][chave]sidechaincompress=threshold=0.045:ratio=9:attack=14:release=440:makeup=1[cama]`,

  ...efeitosCurto.map(([som, t, vol], i) =>
    `[${iSom(som)}:a]${FMT},volume=${vol},` +
    `adelay=${Math.max(0, Math.round(t * 1000))}|${Math.max(0, Math.round(t * 1000))}[e${i}]`),

  `[narr][cama]${efeitosCurto.map((_, i) => `[e${i}]`).join("")}` +
    `amix=inputs=${2 + efeitosCurto.length}:normalize=0:dropout_transition=0,` +
    `loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97,atrim=0:${TOTAL.toFixed(2)}[saida]`,
];

console.log(`\nmixando ${efeitosCurto.length} efeitos...`);
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  ...entradas.flatMap(a => ["-i", a]),
  "-filter_complex", linhas.join(";"),
  "-map", "[saida]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", MIX,
], { stdio: ["ignore", "inherit", "inherit"] });

/* ------------------------------------------------------------ imagem */

const QUADROS = dentro("quadros-curto");
rmSync(QUADROS, { recursive: true, force: true });
mkdirSync(QUADROS, { recursive: true });

const total = Math.round(TOTAL * FPS);
console.log(`\n${total} quadros · ${LARGURA}x${ALTURA} @ ${FPS}fps`);

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});
const ctx = await navegador.newContext({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 1, reducedMotion: "reduce",
});
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", e => erros.push(e.message));
await p.goto("file://" + dentro("cenas.html") + (DEITADO ? "" : "?v=1"), { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1400);   // os iframes das telas precisam assentar
await p.addStyleTag({
  content: ESCONDER.map(id => `#${id}{display:none !important}`).join(""),
});

const inicio = Date.now();
for (let n = 0; n < total; n++) {
  await p.evaluate(tt => window.desenhar(tt), original(n / FPS));
  await p.screenshot({
    path: resolve(QUADROS, "q" + String(n).padStart(5, "0") + ".png"),
    animations: "disabled",
  });
  if (n % 60 === 0 || n === total - 1) {
    const seg = (Date.now() - inicio) / 1000;
    process.stdout.write(`\r  ${n + 1}/${total}  faltam ~${Math.ceil(seg / (n + 1) * (total - n - 1))}s   `);
  }
}
process.stdout.write("\n");
if (erros.length) console.log("ERROS NA PÁGINA:\n" + erros.join("\n"));
await navegador.close();

/* ---------------------------------------------------------- encoding */

const MP4 = dentro(NOME + ".mp4");
console.log("encodando...");
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-framerate", String(FPS), "-i", resolve(QUADROS, "q%05d.png"),
  "-i", MIX,
  "-c:v", "libx264", "-crf", "18", "-preset", "slow",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k", "-shortest", MP4,
], { stdio: ["ignore", "inherit", "inherit"] });

console.log(execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration,size",
  "-of", "default=nw=1", MP4,
]).toString().trim());
console.log(NOME + ".mp4");
