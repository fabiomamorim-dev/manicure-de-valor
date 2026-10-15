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
  ["Sofia Berti",    "5541991230009", "Unhas em gel",        90,   1, "16:00", "Água Verde",  "pedido"],
  ["Marina Souza",   "5541991230006", "Unhas em gel",        90, -58, "14:00", "Água Verde",  "atendido"],
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

// O container não alcança o Google Fonts, e sem isso a tela do produto
// aparece no vídeo com a fonte do sistema — ou seja, não é a tela do produto.
// Troca o <link> pelas mesmas fontes em arquivo local.
const FONTES_LOCAIS = `<style>
@font-face{font-family:Fraunces;src:url(../fontes/fraunces/files/fraunces-latin-600-normal.woff2) format('woff2');font-weight:500 600;font-display:block}
@font-face{font-family:Fraunces;src:url(../fontes/fraunces/files/fraunces-latin-700-normal.woff2) format('woff2');font-weight:700;font-display:block}
@font-face{font-family:Manrope;src:url(../fontes/manrope/files/manrope-latin-400-normal.woff2) format('woff2');font-weight:400;font-display:block}
@font-face{font-family:Manrope;src:url(../fontes/manrope/files/manrope-latin-500-normal.woff2) format('woff2');font-weight:500 600;font-display:block}
@font-face{font-family:Manrope;src:url(../fontes/manrope/files/manrope-latin-700-normal.woff2) format('woff2');font-weight:700 800;font-display:block}
</style>`;

// As fotos do site de demonstração são links para o Unsplash, que também não
// é alcançável daqui — apareceriam como ícone de imagem quebrada no vídeo.
// Troca por uma textura da marca, SÓ nesta cópia: o site publicado continua
// como está. (As fotos de verdade da cliente ainda estão pendentes.)
let n = 0;
const textura = () => {
  const tons = [["#f6ded4", "#e8b4a0"], ["#fbeae2", "#dfa693"], ["#f2d6ca", "#c9907c"]];
  const [a, b] = tons[n++ % tons.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient></defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <circle cx="300" cy="120" r="150" fill="#fff" opacity=".16"/>
    <circle cx="90" cy="330" r="110" fill="#412e2a" opacity=".05"/></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
};

const localizar = html => html
  .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, "")
  .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/g, "")
  .replace(/https:\/\/images\.unsplash\.com\/[^"'\s)]+/g, () => textura())
  .replace("</head>", FONTES_LOCAIS + "</head>");

// O token sai do HTML salvo: ele não serve para nada aqui, e arquivo de
// captura não é lugar de guardar chave.
const salvar = (nome, html) => {
  const limpo = localizar(html).split(TOKEN).join("TOKEN");
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

/* ----------------------------------------------- os passos do agendamento */

// A página de agendar troca de passo por JavaScript, então o Worker só
// devolve o primeiro. Para filmar os outros, salvo cópias que se adiantam
// sozinhas ao abrir — clicando nos mesmos botões que a cliente clicaria,
// não forçando estado por dentro. Se o fluxo quebrar, a captura quebra junto,
// que é o que a gente quer saber.
const avancar = (passos) => `<script>
addEventListener("load", () => {
  const cliques = ${JSON.stringify(passos)};
  let i = 0;
  (function proximo(){
    if (i >= cliques.length) return;
    const alvo = document.querySelector(cliques[i]);
    if (alvo) { alvo.click(); i++; }
    setTimeout(proximo, 90);
  })();
});
<\/script>`;

// A página consulta /api/horarios, e em file:// essa consulta falha e ela cai
// na grade local — mostrando TODOS os horários livres, que é justamente o
// contrário do que a locução promete. Então pergunto ao Worker de verdade,
// aqui, e deixo a resposta pronta dentro da cópia.
const horarios = {};
for (let i = 0; i <= 14; i++) {
  const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
  const r = await worker.fetch(
    new Request(`${SITE}/api/horarios?data=${d}&duracao=90`), env);
  horarios[d] = await r.json();
}

const horariosAssados = `<script>
// Respostas vindas do próprio Worker, sobre o mesmo banco. Não é maquete:
// os horários que faltam faltam porque já tem cliente marcada neles.
const RESPOSTAS = ${JSON.stringify(horarios)};
const original = window.fetch;
window.fetch = (u, o) => {
  const s = String(u);
  if (s.startsWith("/api/horarios")) {
    const dia = new URLSearchParams(s.split("?")[1]).get("data");
    return Promise.resolve(new Response(
      JSON.stringify(RESPOSTAS[dia] || { ok: true, horarios: [] }),
      { headers: { "content-type": "application/json" } }));
  }
  return original(u, o);
};
<\/script>`;

const agendar = await pegar("/agendar");
const comHorarios = agendar.replace("<script>", horariosAssados + "<script>");
salvar("agendar-dia.html",
  comHorarios.replace("</body>", avancar(['[data-servico="Unhas em gel"]']) + "</body>"));
salvar("agendar-hora.html",
  comHorarios.replace("</body>",
    avancar(['[data-servico="Unhas em gel"]', ".dias .dia:nth-child(2)"]) + "</body>"));

console.log("\nem marca/video/telas/");
