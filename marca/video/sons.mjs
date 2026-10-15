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

// Transição entre cenas. Só sobe: varredura que desce lê como queda, e a
// primeira versão disso ficou melancólica por causa exatamente disso. Curta,
// clara, e sem grave — é o grave que dá peso.
function whoosh() {
  const x = buf(0.28), n = x.length;
  const bruto = new Float32Array(n);
  for (let i = 0; i < n; i++) bruto[i] = Math.random() * 2 - 1;
  let ant = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const corte = 700 + Math.pow(t, 1.6) * 9000;     // sobe e para no alto
    const a = (1 / SR) / (1 / (2 * Math.PI * corte) + 1 / SR);
    ant = ant + a * (bruto[i] - ant);
    // sobe rápido, sai rápido: nada de cauda arrastando
    const amp = Math.pow(t, 0.7) * Math.pow(1 - t, 0.45);
    x[i] = ant * amp;
  }
  wav("whoosh.wav", normaliza(passaAlta(x, 900), 0.42));
}

// Alternativa mais discreta: um sopro curto de ar, quase sem corpo. Serve
// quando a cena só troca e não há movimento grande na tela.
function swish() {
  const x = buf(0.17), n = x.length;
  const bruto = new Float32Array(n);
  for (let i = 0; i < n; i++) bruto[i] = Math.random() * 2 - 1;
  let ant = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const corte = 2600 + Math.pow(t, 1.3) * 8000;
    const a = (1 / SR) / (1 / (2 * Math.PI * corte) + 1 / SR);
    ant = ant + a * (bruto[i] - ant);
    x[i] = ant * Math.pow(t, 0.5) * Math.pow(1 - t, 0.6);
  }
  wav("swish.wav", normaliza(passaAlta(x, 2200), 0.3));
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

// Cama musical. A primeira versão ficou melancólica, e o motivo era a soma de
// quatro coisas: registro grave, filtro fechado, um acorde menor no meio e
// acorde trocando a cada sete segundos. Grave, escuro e lento soa triste
// mesmo com harmonia alegre.
//
// Esta é uma oitava acima, mais aberta, só acordes maiores, trocando no dobro
// da velocidade, e com um arpejo leve em cima — é o movimento que tira o ar
// parado, não a harmonia.
function cama(segundos = 57) {
  const n = Math.round(segundos * SR);
  const pad = new Float32Array(n);
  const arp = new Float32Array(n);

  // C – F – C – G: nenhum menor, resolve sempre
  const acordes = [
    [261.63, 329.63, 392.00],   // C
    [349.23, 440.00, 523.25],   // F
    [261.63, 329.63, 392.00],   // C
    [392.00, 493.88, 587.33],   // G
  ];
  const porAcorde = 3.5;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = Math.floor(t / porAcorde) % acordes.length;
    const dentro = (t % porAcorde) / porAcorde;
    const sw = Math.pow(Math.sin(Math.PI * dentro), 0.45);
    let v = 0;
    for (const f of acordes[idx]) {
      v += sine(f, i) * 0.30;
      v += sine(f * 1.004, i, 0.7) * 0.22;   // desafinação, dá corpo
      // harmônicos ímpares baixinhos: seno puro soa como tom de teste,
      // é a sujeira que faz parecer instrumento
      v += sine(f * 3, i, 0.4) * 0.05;
      v += sine(f * 5, i, 1.1) * 0.02;
    }
    pad[i] = v * sw;
  }

  // O movimento vem de baixo, não de cima. A versão com arpejo agudo soou
  // como caixinha de música: nota pura, aguda e rápida é registro de
  // brinquedo. Aqui é a fundamental do acorde pulsando devagar, grave e
  // macia — dá o andar para frente sem tilintar.
  const passo = 0.875;
  for (let k = 0; k * passo < segundos; k++) {
    const t0 = k * passo;
    const idx = Math.floor(t0 / porAcorde) % acordes.length;
    const f = acordes[idx][0] / 2;                  // uma oitava abaixo do pad
    const i0 = Math.round(t0 * SR), dur = Math.round(0.8 * SR);
    for (let i = 0; i < dur && i0 + i < n; i++) {
      const e = Math.pow(Math.max(0, 1 - i / dur), 1.8) * (1 - Math.exp(-i / (SR * 0.02)));
      arp[i0 + i] += (sine(f, i) * 0.7 + sine(f * 2, i) * 0.18 + sine(f * 3, i) * 0.05) * e;
    }
  }

  const y = new Float32Array(n);
  const padF = passaBaixa(pad, 3000);   // nem abafado (1400) nem fino (4500)
  const graveF = passaBaixa(arp, 900);
  for (let i = 0; i < n; i++) y[i] = padF[i] * 0.72 + graveF[i] * 0.42;

  const fade = Math.round(1.8 * SR);
  for (let i = 0; i < fade; i++) { y[i] *= i / fade; y[n - 1 - i] *= i / fade; }
  wav("cama.wav", normaliza(y, 0.5));
}

mensagem(); toque(); whoosh(); swish(); enviado(); lembrete(); cama();
console.log("\nem " + PASTA);
