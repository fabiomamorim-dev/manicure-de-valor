#!/usr/bin/env node
// Monta a trilha do vídeo: locução + cama + efeitos, cada efeito no tempo em
// que a coisa acontece na tela. Os tempos vêm da transcrição real do áudio
// (cortes.json), então a mixagem e a animação leem a mesma fonte.
//
//   node marca/video/mixar.mjs
//
// Sai em marca/video/mix.wav (48 kHz estéreo), que o render fatia.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const AQUI = resolve(import.meta.dirname);
const dentro = (...p) => resolve(AQUI, ...p);
const LOCUCAO = dentro("locucao-v1.mp3");
const SAIDA = dentro("mix.wav");
const DURACAO = 56.2;            // 55.48 da locução + rabicho para o fade

/* ------------------------------------------------------------- os efeitos */
// som, segundo, volume
const EFEITOS = [
  // cena 1 · as sete mensagens caindo, uma a uma, perdendo força para não
  // cansar o ouvido — a ideia é acúmulo, não alarme
  ["mensagem", 0.55, 0.42], ["mensagem", 0.97, 0.39], ["mensagem", 1.39, 0.36],
  ["mensagem", 1.81, 0.33], ["mensagem", 2.23, 0.30], ["mensagem", 2.65, 0.28],
  ["mensagem", 3.07, 0.26],

  // cena 2 · as perguntas entrando por cima
  ["swish", 4.70, 0.30], ["swish", 6.25, 0.30], ["swish", 7.35, 0.30],

  // cena 3 · a virada para o caderninho e o carimbo dos dois meses
  ["whoosh", 14.62, 0.34],
  ["toque", 19.18, 0.50],

  // cena 4 · a virada para o produto e o marcador na palavra
  ["whoosh", 20.32, 0.34],
  ["swish", 22.66, 0.26],

  // cena 5 · o celular entra, rola até os preços, e ela toca nos passos
  ["whoosh", 23.46, 0.30],
  ["swish", 25.42, 0.24],
  ["toque", 27.92, 0.42], ["toque", 29.20, 0.42],

  // cena 6 · o pedido chegando e caindo no painel
  ["mensagem", 32.30, 0.42],
  ["whoosh", 33.40, 0.28], ["toque", 33.66, 0.34],

  // cena 7 · a rolagem pelo painel e a troca para as clientes
  ["swish", 34.60, 0.22], ["swish", 36.95, 0.22],
  ["whoosh", 39.10, 0.28], ["toque", 41.30, 0.38],

  // cena 8 · o lembrete, a mensagem pronta e o envio
  ["whoosh", 42.56, 0.28],
  ["lembrete", 44.46, 0.40],
  ["swish", 45.60, 0.22],
  ["toque", 48.20, 0.44], ["enviado", 48.56, 0.40],

  // cena 9 · a marca
  ["swish", 50.28, 0.24], ["toque", 52.16, 0.34],
];

/* --------------------------------------------------------- grafo do ffmpeg */

const sons = [...new Set(EFEITOS.map(e => e[0]))];
for (const arq of [LOCUCAO, dentro("sons/cama.wav"), ...sons.map(s => dentro(`sons/${s}.wav`))]) {
  if (!existsSync(arq)) {
    console.error(`falta ${arq}\nrode primeiro: node marca/video/sons.mjs`);
    process.exit(1);
  }
}

const entradas = [LOCUCAO, dentro("sons/cama.wav"), ...sons.map(s => dentro(`sons/${s}.wav`))];
const idx = s => 2 + sons.indexOf(s);
const FMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

const linhas = [
  // a locução vai para a mixagem e também serve de chave do compressor
  `[0:a]${FMT},asplit=2[narr][chave]`,

  // A cama abaixa sozinha quando ela fala. É o que faz a música existir sem
  // disputar com a voz: ratio alto, release longo, para a volta ser suave.
  `[1:a]${FMT},volume=0.26,afade=t=in:st=0:d=1.6,` +
    `afade=t=out:st=${(DURACAO - 2.4).toFixed(2)}:d=2.4[cama0]`,
  `[cama0][chave]sidechaincompress=` +
    `threshold=0.045:ratio=9:attack=14:release=440:makeup=1[cama]`,

  // cada efeito empurrado para o seu segundo
  ...EFEITOS.map(([som, t, vol], i) =>
    `[${idx(som)}:a]${FMT},volume=${vol},` +
    `adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[e${i}]`),

  // normalize=0 porque o amix, no padrão, divide tudo pelo número de entradas
  // e a voz sumiria atrás de dezesseis efeitos
  `[narr][cama]${EFEITOS.map((_, i) => `[e${i}]`).join("")}` +
    `amix=inputs=${2 + EFEITOS.length}:normalize=0:dropout_transition=0,` +
    // loudnorm no alvo que Instagram e WhatsApp usam (-14 LUFS): sem isso o
    // vídeo sai baixo no feed e a pessoa não ouve sem aumentar o volume
    `loudnorm=I=-14:TP=-1.5:LRA=11,` +
    `alimiter=limit=0.97,atrim=0:${DURACAO}[saida]`,
];

const args = [
  "-y", "-hide_banner", "-loglevel", "error",
  ...entradas.flatMap(a => ["-i", a]),
  "-filter_complex", linhas.join(";"),
  "-map", "[saida]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
  SAIDA,
];

console.log(`mixando ${EFEITOS.length} efeitos sobre locução + cama...`);
execFileSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });

const dur = execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration",
  "-of", "default=nw=1:nk=1", SAIDA,
]).toString().trim();
console.log(`mix.wav  ${Number(dur).toFixed(2)}s`);
