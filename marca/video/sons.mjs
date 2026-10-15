#!/usr/bin/env node
// Gera a paleta sonora do vídeo. Tudo sintetizado aqui — não existe trilha
// licenciada no projeto, e som de interface é sinal simples o bastante para
// sair bom assim: o que faz um clique soar bem é o envelope, não a fonte.
//
//   node marca/video/sons.mjs
//
// Sai em marca/video/sons/*.wav, 48 kHz mono, 16 bits.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SR = 48000;
const PASTA = join("marca", "video", "sons");
mkdirSync(PASTA, { recursive: true });

/* ------------------------------------------------------------ utilidades */

const buf = segundos => new Float32Array(Math.round(segundos * SR));

// Envelope de ataque e queda. O expoente faz a queda soar natural: queda
// linear soa mecânica, exponencial soa como coisa que para de vibrar.
const env = (n, i, ataque, queda, exp = 2.2) => {
  const a = Math.round(ataque * SR);
  if (i < a) return i / a;
  const t = (i - a) / Math.max(1, n - a - 1);
  return Math.pow(Math.max(0, 1 - t), exp) * (1 - queda * 0);
};

const sine = (f, i, fase = 0) => Math.sin(2 * Math.PI * f * i / SR + fase);

// Filtro passa-baixa de um polo. Tira o brilho de vidro do seno puro e do
// ruído branco, que é o que denuncia som sintetizado.
function passaBaixa(x, corte) {
  const dt = 1 / SR, rc = 1 / (2 * Math.PI * corte), a = dt / (rc + dt);
  const y = new Float32Array(x.length);
  let ant = 0;
  for (let i = 0; i < x.length; i++) { ant = ant + a * (x[i] - ant); y[i] = ant; }
  return y;
}

function passaAlta(x, corte) {
  const dt = 1 / SR, rc = 1 / (2 * Math.PI * corte), a = rc / (rc + dt);
  const y = new Float32Array(x.length);
  let antX = 0, antY = 0;
  for (let i = 0; i < x.length; i++) { antY = a * (antY + x[i] - antX); antX = x[i]; y[i] = antY; }
  return y;
}

const normaliza = (x, pico = 0.9) => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = x[i] / m * pico;
  return x;
};

function wav(nome, amostras) {
  const n = amostras.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, amostras[i]));
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(join(PASTA, nome), b);
  console.log(`${nome.padEnd(16)} ${(n / SR).toFixed(2)}s`);
}

/* ---------------------------------------------------------------- sons */

// Mensagem chegando. Dois tons curtos subindo, como notificação de celular,
// mas sem o brilho agressivo: o passa-baixa corta acima de 4 kHz.
function mensagem() {
  const x = buf(0.26);
  const toques = [[0.0, 880], [0.085, 1174.7]];
  for (const [t0, f] of toques) {
    const i0 = Math.round(t0 * SR), dur = Math.round(0.14 * SR);
    for (let i = 0; i < dur && i0 + i < x.length; i++) {
      const e = env(dur, i, 0.004, 0, 3.4);
      x[i0 + i] += (sine(f, i) * 0.75 + sine(f * 2, i) * 0.16) * e;
    }
  }
  wav("mensagem.wav", normaliza(passaBaixa(x, 4200), 0.82));
}

// Toque na tela. Um estalo é ruído filtrado com queda muito rápida — longo
// demais vira "poc" de rolha, curto demais some na mixagem.
function toque() {
  const x = buf(0.09), n = x.length;
  for (let i = 0; i < n; i++) {
    x[i] = (Math.random() * 2 - 1) * env(n, i, 0.0008, 0, 9) * 0.6
         + sine(620, i) * env(n, i, 0.001, 0, 11) * 0.4;
  }
  wav("toque.wav", normaliza(passaBaixa(passaAlta(x, 420), 5200), 0.55));
}

// Transição entre cenas. Ruído com o corte do filtro subindo e descendo —
// é a varredura que dá a sensação de passagem, não o volume.
function whoosh() {
  const x = buf(0.44), n = x.length;
  const bruto = new Float32Array(n);
  for (let i = 0; i < n; i++) bruto[i] = Math.random() * 2 - 1;
  let ant = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const corte = 300 + Math.sin(Math.PI * t) * 3400;
    const a = (1 / SR) / (1 / (2 * Math.PI * corte) + 1 / SR);
    ant = ant + a * (bruto[i] - ant);
    x[i] = ant * Math.sin(Math.PI * t) * Math.sin(Math.PI * t);
  }
  wav("whoosh.wav", normaliza(x, 0.4));
}

// Pedido entregue. Tríade subindo, resolvendo — é o som de "deu certo".
function enviado() {
  const x = buf(0.7);
  const notas = [[0.0, 587.33], [0.075, 739.99], [0.15, 880], [0.235, 1174.7]];
  for (const [t0, f] of notas) {
    const i0 = Math.round(t0 * SR), dur = Math.round(0.42 * SR);
    for (let i = 0; i < dur && i0 + i < x.length; i++) {
      const e = env(dur, i, 0.003, 0, 2.6);
      x[i0 + i] += (sine(f, i) * 0.6 + sine(f * 2, i) * 0.12 + sine(f * 3, i) * 0.05) * e;
    }
  }
  wav("enviado.wav", normaliza(passaBaixa(x, 6000), 0.8));
}

// Lembrete. Sino: parciais inarmônicos e queda longa. Harmônico exato soa
// como apito; é a razão quebrada que faz o ouvido ouvir metal.
function lembrete() {
  const x = buf(1.6), n = x.length;
  const parciais = [[1, 0.6], [2.76, 0.22], [5.4, 0.1], [8.93, 0.05]];
  const f0 = 784;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const [r, g] of parciais) v += sine(f0 * r, i) * g * Math.exp(-i / SR * (2.2 + r * 0.7));
    x[i] = v * env(n, i, 0.002, 0, 1.0);
  }
  wav("lembrete.wav", normaliza(passaBaixa(x, 7000), 0.62));
}

// Cama musical. Pad de acordes longos, bem embaixo da voz. Osciladores
// levemente desafinados entre si: afinação exata soa como órgão de brinquedo,
// a batida lenta entre eles é o que dá corpo.
function cama(segundos = 57) {
  const x = buf(segundos), n = x.length;
  // I – vi – IV – V em dó, que é familiar e resolve sem chamar atenção
  const acordes = [
    [130.81, 164.81, 196.00],   // C
    [110.00, 130.81, 164.81],   // Am
    [87.31, 130.81, 174.61],    // F
    [98.00, 123.47, 146.83],    // G
  ];
  const porAcorde = segundos / 8;   // duas voltas
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = Math.floor(t / porAcorde) % acordes.length;
    const dentro = (t % porAcorde) / porAcorde;
    // sobe e desce dentro do acorde, e os acordes se sobrepõem no cruzamento
    const sw = Math.pow(Math.sin(Math.PI * dentro), 0.55);
    let v = 0;
    for (const f of acordes[idx]) {
      v += sine(f, i) * 0.34;
      v += sine(f * 1.003, i, 0.7) * 0.26;          // desafinação lenta
      v += sine(f * 2, i, 1.3) * 0.07;              // oitava, discreta
    }
    x[i] = v * sw;
  }
  // respiração muito lenta, para não ficar parado
  for (let i = 0; i < n; i++) x[i] *= 0.85 + 0.15 * Math.sin(2 * Math.PI * i / SR / 11);
  const y = passaBaixa(passaBaixa(x, 1400), 2600);
  // entra e sai sem corte seco
  const fade = Math.round(2.5 * SR);
  for (let i = 0; i < fade; i++) { y[i] *= i / fade; y[n - 1 - i] *= i / fade; }
  wav("cama.wav", normaliza(y, 0.5));
}

mensagem(); toque(); whoosh(); enviado(); lembrete(); cama();
console.log("\nem " + PASTA);
