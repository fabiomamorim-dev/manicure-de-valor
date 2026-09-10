#!/usr/bin/env node
// Cria ou atualiza a pasta de um cliente.
//
//   node scripts/novo-cliente.mjs carlasilva
//
// Lê  public/clientes/<slug>/dados.json  (cria um modelo se não existir)
// Gera public/clientes/<slug>/index.html a partir de template/index.html

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const slug = process.argv[2];

if (!slug) {
  console.error("Falta o slug.  Ex: node scripts/novo-cliente.mjs carlasilva");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Slug inválido: "${slug}". Use só letras minúsculas, números e hífen.`);
  process.exit(1);
}

const pasta = join("public", "clientes", slug);
const arquivoDados = join(pasta, "dados.json");

const G = "https://fonts.googleapis.com/css2?";

// Cada tema so carrega as fontes que usa. As cores ficam no template,
// em html[data-tema="..."].
const TEMAS = {
  pop: {
    rotulo: "Pop — o padrao: creme, vermelho-rosa e amarelo, tipografia pesada",
    fontes: G + "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,800&family=Instrument+Sans:wght@400;500&display=swap"
  },
  clean: {
    rotulo: "Clean — creme, bordo e dourado, titulo serifado",
    fontes: G + "family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap"
  },
  soft: {
    rotulo: "Soft — rosa claro, nude e marrom",
    fontes: G + "family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500&display=swap"
  },
  minimal: {
    rotulo: "Minimal — off-white, marrom e preto, sem cor forte",
    fontes: G + "family=Instrument+Serif&family=Instrument+Sans:wght@400;500&display=swap"
  },
  glam: {
    rotulo: "Glam — bordo, rosa e dourado",
    fontes: G + "family=Playfair+Display:wght@500;700&family=Manrope:wght@400;500&display=swap"
  }
};

const MODELO = {
  tema: "pop",
  profissional: "Nome da profissional",
  whatsapp: "5511900000000",
  servicos: [
    { nome: "Manicure", desc: "Corte, lixa, cutícula e esmaltação", preco: "R$ 45" },
    { nome: "Pedicure", desc: "Cuidado completo dos pés com hidratação", preco: "R$ 50" }
  ],
  horarios: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"],
  pedirBairro: true,
  bairros: ["Centro", "Outro"],
  diasDeAntecedencia: 0,
  diasDeRetorno: 21,
  fotos: {
    capa: "",
    galeria: ["", "", "", "", "", ""]
  },
  instagram: "",
  sobre: {
    texto: "",
    foto: ""
  },
  // Nada aqui e inventado: so entra numero real, dito pela profissional.
  // Vazio = a secao nem aparece no site.
  avaliacoes: {
    nota: "",
    quantidade: "",
    atendimentos: ""
  },
  depoimentos: []
};

mkdirSync(pasta, { recursive: true });

if (!existsSync(arquivoDados)) {
  writeFileSync(arquivoDados, JSON.stringify(MODELO, null, 2) + "\n");
  console.log(`Criei ${arquivoDados} com dados de exemplo.`);
  console.log("Preencha e rode o comando de novo.");
  process.exit(0);
}

let dados;
try {
  dados = JSON.parse(readFileSync(arquivoDados, "utf8"));
} catch (erro) {
  console.error(`${arquivoDados} não é um JSON válido: ${erro.message}`);
  process.exit(1);
}

const faltando = ["profissional", "whatsapp", "servicos", "horarios"]
  .filter((c) => !dados[c] || (Array.isArray(dados[c]) && dados[c].length === 0));

if (faltando.length) {
  console.error(`Faltam campos em ${arquivoDados}: ${faltando.join(", ")}`);
  process.exit(1);
}

const tema = dados.tema || "pop";
if (!TEMAS[tema]) {
  console.error(`Tema desconhecido: "${tema}". Os que existem:`);
  for (const [nome, t] of Object.entries(TEMAS)) console.error(`  ${nome.padEnd(8)} ${t.rotulo}`);
  process.exit(1);
}

if (!/^55\d{10,11}$/.test(String(dados.whatsapp))) {
  console.error(`WhatsApp fora do formato. Esperado 55 + DDD + número, ex: 5511987654321. Veio: ${dados.whatsapp}`);
  process.exit(1);
}

// As fotos que estiverem em public/clientes/<slug>/fotos/ mandam mais que o
// dados.json. A pagina ferramentas/fotos.html entrega os arquivos ja com esses
// nomes: capa, 01 a 06 e sobre. Isso so afeta o HTML gerado — o dados.json
// continua sendo escrito a mao e nao e alterado aqui.
const pastaFotos = join(pasta, "fotos");
const acharFoto = (nome) => {
  const ext = [".webp", ".jpg", ".jpeg", ".png"].find((e) =>
    existsSync(join(pastaFotos, nome + e)));
  return ext ? `fotos/${nome}${ext}` : "";
};

const achadas = [];

if (existsSync(pastaFotos)) {
  dados.fotos = dados.fotos || {};

  const capa = acharFoto("capa");
  if (capa) { dados.fotos.capa = capa; achadas.push("capa"); }

  const galeria = Array.isArray(dados.fotos.galeria) ? [...dados.fotos.galeria] : [];
  for (let i = 0; i < 6; i++) {
    const posicao = String(i + 1).padStart(2, "0");
    const arquivo = acharFoto(posicao);
    if (arquivo) { galeria[i] = arquivo; achadas.push(posicao); }
  }
  dados.fotos.galeria = galeria;

  const retrato = acharFoto("sobre");
  if (retrato) {
    dados.sobre = dados.sobre || {};
    dados.sobre.foto = retrato;
    achadas.push("sobre");
  }
}

if (achadas.length) {
  console.log(`Fotos da pasta: ${achadas.join(", ")}.`);
} else if (!dados.fotos || !dados.fotos.capa) {
  console.log("Aviso: nenhuma foto. Abra ferramentas/fotos.html, gere o zip e");
  console.log(`descompacte em ${pastaFotos}.`);
}

const html = readFileSync(join("template", "index.html"), "utf8")
  .replaceAll("__DADOS__", JSON.stringify(dados, null, 2))
  .replaceAll("__NOME__", dados.profissional)
  .replaceAll("__TEMA__", tema)
  .replaceAll("__FONTES__", `<link href="${TEMAS[tema].fontes}" rel="stylesheet">`);

writeFileSync(join(pasta, "index.html"), html);

console.log(`Pronto: ${join(pasta, "index.html")} — tema ${tema}`);
console.log(`Prévia local:  npx wrangler dev`);
console.log(`No ar:         https://${slug}.manicuredevalor.com.br`);
