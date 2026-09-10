// Testa o Worker sem subir nada: banco de mentira em cima do sqlite que já vem
// no node, e os arquivos reais do repo no lugar do ASSETS da Cloudflare.
//
//   node teste/painel.test.mjs
//
// Precisa de node 22.5 ou mais novo (por causa do node:sqlite).

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  console.error("Esse teste precisa de node 22.5+ (node:sqlite). Seu node:", process.version);
  process.exit(1);
}

const aqui = (rel) => new URL(rel, import.meta.url);
const ler = (rel) => readFileSync(aqui(rel), "utf8");

// worker/index.js é ESM mas o repo não tem package.json — importa pelo conteúdo.
const worker = (await import(
  "data:text/javascript;base64," + Buffer.from(ler("../worker/index.js")).toString("base64")
)).default;

const SEGREDO = "segredo-de-teste";
const SITE = "https://carlasilva.manicuredevalor.com.br";

const db = new DatabaseSync(":memory:");
db.exec(ler("../db/schema.sql").replace(/^--.*$/gm, ""));

const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        const st = db.prepare(sql);
        return {
          run: async () => st.run(...args),
          all: async () => ({ results: st.all(...args) }),
        };
      },
    };
  },
};

const ASSETS = {
  async fetch(req) {
    const mapa = {
      "/clientes/carlasilva/index.html": "../public/clientes/carlasilva/index.html",
      "/clientes/carlasilva/dados.json": "../public/clientes/carlasilva/dados.json",
      "/site/index.html": "../public/site/index.html",
    };
    const rel = mapa[new URL(req.url).pathname];
    return rel
      ? new Response(ler(rel), { status: 200 })
      : new Response("não existe", { status: 404 });
  },
};

const env = { ASSETS, DB, PAINEL_SEGREDO: SEGREDO };
const chave = createHmac("sha256", SEGREDO).update("carlasilva").digest("hex").slice(0, 24);

let falhas = 0;
const ok = (cond, oque) => {
  console.log((cond ? "  ok   " : "  FALHA") + "  " + oque);
  if (!cond) falhas++;
};

const pedir = (corpo, ambiente = env, site = SITE) =>
  worker.fetch(new Request(site + "/api/pedido", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }), ambiente);

const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

console.log("\npedido");
let r = await pedir({ nome: "Marina Souza", fone: "11 98888-1111", servico: "Unhas em gel",
                      data: diasAtras(25), hora: "14:00", bairro: "Moema", retorno: 21 });
ok(r.status === 200 && (await r.json()).ok === true, "grava o pedido");

r = await pedir({ nome: "", fone: "", servico: "", data: "" });
ok(r.status === 400, "recusa pedido sem campos");

r = await pedir({ nome: "X", fone: "11999999999", servico: "Manicure", data: diasAtras(1) },
                env, "https://naoexiste.manicuredevalor.com.br");
ok(r.status === 404, "recusa pedido de subdomínio sem site");

r = await pedir({ nome: "X", fone: "1199", servico: "Manicure", data: diasAtras(1) },
                { ...env, DB: undefined });
ok(r.status === 200 && (await r.json()).ok === false, "sem banco, responde sem quebrar o site");

console.log("\npainel");
r = await worker.fetch(new Request(`${SITE}/painel?k=${chave}`), env);
let html = await r.text();
ok(r.status === 200, "abre com o link certo");
ok(html.includes("Marina Souza"), "mostra a cliente");
ok(html.includes("Carla Silva"), "usa o nome da profissional");
ok(html.includes('name="robots" content="noindex"'), "pede para o google não indexar");

r = await worker.fetch(new Request(`${SITE}/painel?k=erradoerradoerrado1234`), env);
ok(r.status === 403, "recusa link errado");
r = await worker.fetch(new Request(`${SITE}/painel`), env);
ok(r.status === 403, "recusa sem link");

const chaveOutra = createHmac("sha256", SEGREDO).update("mariasouza").digest("hex").slice(0, 24);
r = await worker.fetch(new Request(`${SITE}/painel?k=${chaveOutra}`), env);
ok(r.status === 403, "link de uma profissional não abre o painel de outra");

console.log("\nmarcar atendimento");
const id = db.prepare("SELECT id FROM pedidos WHERE nome='Marina Souza'").get().id;
const marcar = (acao, k = chave) =>
  worker.fetch(new Request(`${SITE}/api/marcar?k=${k}`, {
    method: "POST", body: new URLSearchParams({ id: String(id), acao }), redirect: "manual",
  }), env);

r = await marcar("atendida");
ok(r.status === 303, "confirma o atendimento e volta pro painel");

html = await (await worker.fetch(new Request(`${SITE}/painel?k=${chave}`), env)).text();
ok(html.indexOf("Marina") > html.indexOf("Chamar agora")
   && html.indexOf("Marina") < html.indexOf("Vence essa semana"),
   "25 dias com retorno de 21 cai em 'chamar agora'");
ok(/wa\.me\/5511988881111\?text=/.test(html), "monta o link do WhatsApp com DDI");
ok(decodeURIComponent(html.match(/text=([^"]+)/)[1]).includes("Oi, Marina Souza! Aqui é a Carla Silva"),
   "mensagem sai escrita com os dois nomes");

r = await marcar("arquivar", "erradoerradoerrado1234");
ok(r.status === 403, "não deixa arquivar com link errado");

await marcar("arquivar");
html = await (await worker.fetch(new Request(`${SITE}/painel?k=${chave}`), env)).text();
ok(!html.includes("Marina Souza"), "arquivada some do painel");

console.log("\nsite continua servindo");
r = await worker.fetch(new Request(SITE + "/"), env);
ok(r.status === 200 && (await r.text()).includes("Carla Silva"), "site da cliente abre");
r = await worker.fetch(new Request("https://manicuredevalor.com.br/"), env);
ok(r.status === 200 && (await r.text()).includes("Manicure de Valor"), "institucional abre");
r = await worker.fetch(new Request(SITE + "/fotos/naoexiste.webp"), env);
ok(r.status === 404, "foto inexistente dá 404");
html = await (await worker.fetch(new Request("https://manicuredevalor.com.br/painel?k=" + chave), env)).text();
ok(!html.includes("Chamar agora") && !html.includes("noindex"),
   "domínio raiz não serve painel");

console.log(falhas ? `\n${falhas} falha(s)\n` : "\ntudo passou\n");
process.exit(falhas ? 1 : 0);
