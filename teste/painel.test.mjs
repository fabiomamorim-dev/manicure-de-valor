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
const comoModulo = (src) => "data:text/javascript;base64," + Buffer.from(src).toString("base64");

// O repo não tem package.json de propósito, então os módulos entram pelo
// conteúdo. O index importa o agenda.js: o caminho relativo não resolve a
// partir de uma data URL, então ele é trocado pela data URL do próprio agenda.
const agendaUrl = comoModulo(ler("../worker/agenda.js"));
const agenda = await import(agendaUrl);
const worker = (await import(
  comoModulo(ler("../worker/index.js").replace('from "./agenda.js"', `from "${agendaUrl}"`))
)).default;

const { normFone, foneValido, livresNoDia, sobramHoje, hojeSP, somaDias } = agenda;

const SEGREDO = "segredo-de-teste";
const SITE = "https://carlasilva.manicuredevalor.com.br";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
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
    const caminho = new URL(req.url).pathname;
    const mapa = {
      "/clientes/carlasilva/": "../public/clientes/carlasilva/index.html",
      "/clientes/carlasilva/agendar/": "../public/clientes/carlasilva/agendar/index.html",
      "/clientes/carlasilva/dados.json": "../public/clientes/carlasilva/dados.json",
      "/site/": "../public/site/index.html",
    };
    // o roteador da Cloudflare normaliza "/pasta" para "/pasta/"
    if (!caminho.endsWith("/") && mapa[caminho + "/"]) {
      return new Response(null, { status: 308, headers: { location: caminho + "/" } });
    }
    if (caminho.endsWith("/index.html")) {
      const pasta = caminho.replace(/index\.html$/, "");
      if (mapa[pasta]) return new Response(null, { status: 308, headers: { location: pasta } });
    }
    const rel = mapa[caminho];
    return rel ? new Response(ler(rel), { status: 200 })
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

const HOJE = hojeSP();
const umaLinha = (sql, ...p) => db.prepare(sql).get(...p);
const conta = (sql, ...p) => db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...p).n;

const pedir = (corpo, ambiente = env, site = SITE) =>
  worker.fetch(new Request(site + "/api/pedido", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }), ambiente);

const form = (rota, campos) =>
  worker.fetch(new Request(`${SITE}${rota}?k=${chave}`, {
    method: "POST", body: new URLSearchParams(campos), redirect: "manual",
  }), env);

const abrirPainel = async (q = "") =>
  (await worker.fetch(new Request(`${SITE}/painel?k=${chave}${q}`), env)).text();

/* ------------------------------------------------------------- unidades */

console.log("\ntelefone");
ok(normFone("(41) 99999-8888") === "5541999998888", "formatado vira só dígitos com DDI");
ok(normFone("41999998888") === "5541999998888", "sem DDI ganha o 55");
ok(normFone("5541999998888") === "5541999998888", "com DDI fica igual");
ok(normFone("(41) 99999-8888") === normFone("41 9 9999 8888"),
   "jeitos diferentes de escrever caem na mesma cliente");
ok(!foneValido("4199") && foneValido("41999998888"), "recusa telefone curto");

console.log("\nfuso");
// 02:00 UTC de dia 15 ainda é dia 14 em Brasília. Era aqui que a agenda
// mostrava "hoje" errado toda noite depois das nove.
ok(hojeSP(new Date("2026-10-15T02:00:00Z")) === "2026-10-14",
   "depois das 21h de Brasília, hoje ainda é o dia anterior em UTC");
ok(hojeSP(new Date("2026-10-15T12:00:00Z")) === "2026-10-15", "durante o dia bate");

console.log("\nhorários livres");
const grade = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00"];
ok(livresNoDia(grade, [], 60).length === 6, "dia vazio oferece a grade inteira");
ok(!livresNoDia(grade, [{ hora: "09:00", duracao: 60 }], 60).includes("09:00"),
   "horário tomado some");
const comLongo = livresNoDia(grade, [{ hora: "09:00", duracao: 120 }], 60);
ok(!comLongo.includes("09:00") && !comLongo.includes("10:00"),
   "atendimento de duas horas ocupa os dois horários");
ok(!livresNoDia(grade, [], 120).includes("15:00"),
   "serviço de duas horas não cabe no último horário do dia");
ok(livresNoDia(grade, [{ hora: null, duracao: 60 }], 60).length === 6,
   "atendimento sem hora marcada não bloqueia ninguém");
ok(sobramHoje(grade, "10:30", 2).join() === "14:00,15:00",
   "com duas horas de antecedência, de manhã só sobra a tarde");

/* --------------------------------------------------------- pedido do site */

console.log("\npedido pelo site");
let r = await pedir({ nome: "Marina Souza", fone: "(11) 98888-1111", servico: "Unhas em gel",
                      data: somaDias(HOJE, 3), hora: "14:00", bairro: "Moema", duracao: 90 });
ok(r.status === 200 && (await r.json()).ok === true, "grava o pedido");
ok(conta("clientes") === 1, "criou a cliente");
ok(umaLinha("SELECT fone FROM clientes").fone === "5511988881111", "guardou o telefone normalizado");
ok(umaLinha("SELECT duracao, status, origem FROM atendimentos").duracao === 90,
   "guardou a duração do serviço");

r = await pedir({ nome: "Marina S.", fone: "11 9 8888 1111", servico: "Unhas em gel",
                  data: somaDias(HOJE, 3), hora: "14:00" });
ok((await r.json()).repetido === true, "o mesmo pedido de novo não duplica");
ok(conta("clientes") === 1, "e não cria uma segunda Marina");

r = await pedir({ nome: "X", fone: "11999999999", servico: "Manicure", data: HOJE },
                env, "https://naoexiste.manicuredevalor.com.br");
ok(r.status === 404, "recusa pedido de subdomínio sem site");

r = await pedir({ nome: "", fone: "", servico: "", data: "" });
ok(r.status === 400, "recusa pedido sem campos");

r = await pedir({ nome: "X", fone: "1199", servico: "Manicure", data: HOJE },
                { ...env, DB: undefined });
ok(r.status === 200 && (await r.json()).ok === false, "sem banco, responde sem quebrar o site");

/* ------------------------------------------------------- horários da API */

console.log("\nAPI de horários");
const dia = somaDias(HOJE, 3);
const vagas = await (await worker.fetch(
  new Request(`${SITE}/api/horarios?data=${dia}&duracao=60`), env)).json();
ok(vagas.ok && Array.isArray(vagas.horarios), "responde a lista do dia");
ok(!vagas.horarios.includes("14:00"),
   "o horário que a Marina pediu não é oferecido para outra cliente");
const ontem = await (await worker.fetch(
  new Request(`${SITE}/api/horarios?data=${somaDias(HOJE, -1)}`), env)).json();
ok(ontem.horarios.length === 0, "dia que já passou não oferece horário");

/* ------------------------------------------------------------- o painel */

console.log("\npainel");
let html = await abrirPainel();
ok(html.includes("Marina Souza"), "mostra quem pediu");
ok(html.includes("Pedidos novos"), "separa os pedidos novos");
ok(html.includes('name="robots" content="noindex"'), "pede para o google não indexar");
ok(html.includes("Lançar atendimento"), "tem a entrada manual");

r = await worker.fetch(new Request(`${SITE}/painel?k=erradoerradoerrado1234`), env);
ok(r.status === 403, "recusa link errado");
const chaveOutra = createHmac("sha256", SEGREDO).update("mariasouza").digest("hex").slice(0, 24);
r = await worker.fetch(new Request(`${SITE}/painel?k=${chaveOutra}`), env);
ok(r.status === 403, "link de uma profissional não abre a agenda de outra");

/* --------------------------------------------------------- entrada manual */

console.log("\nlançar na mão");
r = await form("/api/lancar", { tipo: "feito", nome: "Ana Lima", fone: "(41) 98888-7777",
                                servico: "Pé e mão", data: somaDias(HOJE, -25), hora: "10:00" });
ok(r.status === 303, "salva e volta pro painel");
ok(conta("clientes") === 2, "criou a cliente nova");
ok(umaLinha("SELECT status FROM atendimentos WHERE servico='Pé e mão'").status === "atendido",
   "'já atendi' entra como atendido");

r = await form("/api/lancar", { tipo: "feito", nome: "", fone: "", servico: "", data: "" });
ok(new URL(r.headers.get("location")).searchParams.get("aviso") === "faltou",
   "sem os campos, avisa em vez de gravar");

const lookup = await (await worker.fetch(
  new Request(`${SITE}/api/cliente?k=${chave}&fone=41988887777`), env)).json();
ok(lookup.achou && lookup.nome === "Ana Lima" && lookup.ultimo.servico === "Pé e mão",
   "digitar um telefone conhecido traz o nome e o último serviço");
r = await worker.fetch(new Request(`${SITE}/api/cliente?fone=41988887777`), env);
ok(r.status === 403, "a consulta de cliente exige o link assinado");

/* ---------------------------------------------------------- hora de voltar */

console.log("\nhora de voltar");
html = await abrirPainel();
ok(html.slice(html.indexOf("Hora de voltar")).includes("Ana Lima"),
   "quem foi atendida faz 25 dias com retorno de 21 aparece como vencida");
ok(html.includes("passou 4 do prazo"), "mostra quantos dias passaram do prazo");

// Marcar um horário futuro tira a cliente da lista: ela já vai voltar, não
// faz sentido o painel mandar chamar.
r = await form("/api/lancar", { tipo: "marcar", nome: "Ana Lima", fone: "41988887777",
                                servico: "Manicure", data: somaDias(HOJE, 2), hora: "09:00" });
ok(conta("clientes") === 2, "mesma cliente pelo telefone, não cria outra");
ok(umaLinha("SELECT status FROM atendimentos WHERE servico='Manicure'").status === "confirmado",
   "'marcar horário' entra como confirmado");

html = await abrirPainel();
ok(!html.slice(html.indexOf("Hora de voltar")).includes("Ana Lima"),
   "com horário já marcado, para de ser cobrada para voltar");
ok(html.slice(html.indexOf("Próximos dias")).includes("Ana Lima"),
   "e passa a aparecer nos próximos dias");

console.log("\nclientes");
html = await abrirPainel("&ver=clientes");
ok(html.includes("Ana Lima") && html.includes("Marina Souza"), "lista as duas");
ok(html.includes("atendimento"), "mostra quantas vezes cada uma veio");

/* ------------------------------------------------------------- limpeza */

console.log("\nlimpeza automática");
db.prepare(`INSERT INTO clientes (slug, nome, fone, criado_em)
            VALUES ('carlasilva','Cliente Antiga','5541900001111', datetime('now'))`).run();
const antigaId = umaLinha("SELECT id FROM clientes WHERE nome='Cliente Antiga'").id;
db.prepare(`INSERT INTO atendimentos (slug, cliente_id, servico, data, status, criado_em)
            VALUES ('carlasilva', ?, 'Pé e mão', ?, 'atendido', datetime('now'))`)
  .run(antigaId, somaDias(HOJE, -400));
db.prepare(`INSERT INTO clientes (slug, nome, fone, criado_em)
            VALUES ('carlasilva','Antiquíssima','5541900002222', datetime('now'))`).run();
const velhaId = umaLinha("SELECT id FROM clientes WHERE nome='Antiquíssima'").id;
db.prepare(`INSERT INTO atendimentos (slug, cliente_id, servico, data, status, criado_em)
            VALUES ('carlasilva', ?, 'Manicure', ?, 'atendido', datetime('now'))`)
  .run(velhaId, somaDias(HOJE, -800));

let espera;
await worker.scheduled({}, env, { waitUntil: (p) => { espera = p; } });
await espera;

const anon = umaLinha("SELECT nome, fone FROM clientes WHERE id = ?", antigaId);
ok(anon && anon.nome === "" && String(anon.fone).startsWith("anon"),
   "passado um ano sem atendimento, nome e telefone saem");
ok(conta("atendimentos WHERE cliente_id = ?", antigaId) === 1,
   "mas o atendimento fica, anônimo, para entender demanda");
ok(conta("clientes WHERE id = ?", velhaId) === 0,
   "passados dois anos, o atendimento sai e a cliente sem histórico vai junto");
ok(umaLinha("SELECT nome FROM clientes WHERE nome='Marina Souza'") !== undefined,
   "quem é cliente ativa não é tocada");

/* --------------------------------------------------- o site continua de pé */

console.log("\nsite continua servindo");
r = await worker.fetch(new Request(SITE + "/"), env);
ok(r.status === 200 && (await r.text()).includes("Carla Silva"), "site da cliente abre");
r = await worker.fetch(new Request("https://manicuredevalor.com.br/"), env);
ok(r.status === 200 && (await r.text()).includes("Manicure de Valor"), "institucional abre");
r = await worker.fetch(new Request(SITE + "/agendar"), env);
html = await r.text();
ok(r.status === 200 && !r.headers.get("location") && html.includes("O que você quer fazer?"),
   "/agendar abre a página de agendamento sem expor o caminho interno");
r = await worker.fetch(new Request(SITE + "/fotos/naoexiste.webp"), env);
ok(r.status === 404, "foto inexistente dá 404");
html = await (await worker.fetch(new Request("https://manicuredevalor.com.br/painel?k=" + chave), env)).text();
ok(!html.includes("Sua agenda"), "domínio raiz não serve painel");
r = await worker.fetch(new Request(SITE + "/clientes/carlasilva/"), env, { redirect: "manual" });
ok(r.status === 301 && new URL(r.headers.get("location")).pathname === "/",
   "caminho interno pedido direto volta para a raiz");
r = await worker.fetch(new Request(SITE + "/rota/que/nao/existe"), env);
ok(r.status === 200 && !r.headers.get("location"),
   "rota desconhecida cai no site sem expor o caminho interno");

console.log(falhas ? `\n${falhas} falha(s)\n` : "\ntudo passou\n");
process.exit(falhas ? 1 : 0);
