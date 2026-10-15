#!/usr/bin/env node
// Gera as telas do produto para o vídeo, sem navegador e sem rede: roda o
// próprio Worker em cima de um banco de mentira, como o teste faz, e salva o
// HTML que ele devolve. Assim a tela do vídeo é a tela de verdade — se o
// painel mudar, as capturas mudam junto.
//
//   node marca/video/telas.mjs
//
// Sai em marca/video/telas/*.html, prontos para o Playwright fotografar.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const aqui = rel => new URL(rel, import.meta.url);
const ler = rel => readFileSync(aqui(rel), "utf8");
const comoModulo = src => "data:text/javascript;base64," + Buffer.from(src).toString("base64");

const agendaUrl = comoModulo(ler("../../worker/agenda.js"));
const worker = (await import(
  comoModulo(ler("../../worker/index.js").replace('from "./agenda.js"', `from "${agendaUrl}"`))
)).default;

const SAIDA = new URL("telas/", import.meta.url);
mkdirSync(SAIDA, { recursive: true });

/* ------------------------------------------------------- banco de mentira */

const db = new DatabaseSync(":memory:");
db.exec(ler("../../db/schema.sql").replace(/^--.*$/gm, ""));

const TOKEN = "t".repeat(32);
const APARELHO = "d".repeat(32);
db.prepare(`INSERT INTO profissionais (slug,token,pin_hash,pin_salt,criado_em)
            VALUES ('carlasilva', ?, 'x', 'y', datetime('now'))`).run(TOKEN);
db.prepare(`INSERT INTO dispositivos (token,slug,criado_em)
            VALUES (?, 'carlasilva', datetime('now'))`).run(APARELHO);

// Clientes de mentira, com nomes e bairros de Curitiba. Distribuídas para que
// as quatro seções do painel apareçam cheias: hoje, próximos dias, vencidas e
// vencendo.
const gente = [
  ["Juliana Prado",  "5541991230001", "Unhas em gel",        90,   0, "09:00", "Água Verde",  "confirmado"],
  ["Renata Dias",    "5541991230002", "Manicure + pedicure", 120,  0, "14:00", "Batel",       "confirmado"],
  ["Camila Ferraz",  "5541991230003", "Manicure",            60,   1, "10:00", "Portão",      "confirmado"],
  ["Patrícia Nunes", "5541991230004", "Alongamento",         150,  1, "15:00", "Rebouças",    "confirmado"],
  ["Bianca Rocha",   "5541991230005", "Unhas em gel",        90,   2, "09:00", "Vila Izabel", "confirmado"],
  ["Marina Souza",   "5541991230006", "Unhas em gel",        90, -25, "14:00", "Água Verde",  "atendido"],
  ["Letícia Amaral", "5541991230007", "Manicure",            60, -23, "10:00", "Batel",       "atendido"],
  ["Aline Castro",   "5541991230008", "Pé e mão",            60, -17, "16:00", "Centro",      "atendido"],
];

for (const [nome, fone, servico, duracao, off, hora, bairro, status] of gente) {
  db.prepare(`INSERT INTO clientes (slug,nome,fone,criado_em)
              VALUES ('carlasilva',?,?,datetime('now'))`).run(nome, fone);
  const { id } = db.prepare(`SELECT id FROM clientes WHERE fone = ?`).get(fone);
  db.prepare(`INSERT INTO atendimentos
      (slug,cliente_id,servico,duracao,data,hora,bairro,onde,status,retorno,origem,criado_em)
      VALUES ('carlasilva',?,?,?,date('now', ?),?,?, 'vou', ?, 21, 'painel', datetime('now'))`)
    .run(id, servico, duracao, `${off} day`, hora, bairro, status);
}

/* ------------------------------------------------------- ambiente do Worker */

const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        const st = db.prepare(sql);
        return { run: async () => st.run(...args), all: async () => ({ results: st.all(...args) }) };
      },
    };
  },
};

const ASSETS = {
  async fetch(req) {
    const p = new URL(req.url).pathname;
    const mapa = {
      "/clientes/carlasilva/": "../../public/clientes/carlasilva/index.html",
      "/clientes/carlasilva/agendar/": "../../public/clientes/carlasilva/agendar/index.html",
      "/clientes/carlasilva/dados.json": "../../public/clientes/carlasilva/dados.json",
      "/site/": "../../public/site/index.html",
    };
    // o roteador da Cloudflare normaliza "/pasta" para "/pasta/"
    const chave = mapa[p] ? p : (mapa[p + "/"] ? p + "/" : null);
    return chave ? new Response(ler(mapa[chave]), { status: 200 })
                 : new Response("não existe", { status: 404 });
  },
};

const env = { ASSETS, DB };
const SITE = "https://carlasilva.manicuredevalor.com.br";
const cookie = { cookie: `mdv_aparelho=${APARELHO}` };

/* ------------------------------------------------------------------ telas */

// O token sai do HTML salvo: ele não serve para nada aqui, e arquivo de
// captura não é lugar de guardar chave.
const salvar = (nome, html) => {
  const limpo = html.split(TOKEN).join("TOKEN");
  writeFileSync(new URL(nome, SAIDA), limpo);
  console.log(`${nome.padEnd(22)} ${(limpo.length / 1024).toFixed(1)} kB`);
};

const pegar = async (rota) => {
  const r = await worker.fetch(new Request(`${SITE}${rota}`, { headers: cookie }), env);
  return await r.text();
};

salvar("agenda.html",   await pegar(`/painel?k=${TOKEN}`));
salvar("clientes.html", await pegar(`/painel?k=${TOKEN}&ver=clientes`));
salvar("site.html",     await pegar("/"));
salvar("agendar.html",  await pegar("/agendar"));

console.log("\nem marca/video/telas/");
