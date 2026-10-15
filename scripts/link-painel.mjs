#!/usr/bin/env node
// Gera o link privado do painel de manutenção de uma profissional.
//
//   PAINEL_SEGREDO="o mesmo segredo do worker" node scripts/link-painel.mjs carlasilva
//
// O link não fica guardado em lugar nenhum: é uma assinatura do slug com o
// segredo. Trocar o segredo invalida todos os links de uma vez.

import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

// Segredo da Cloudflare não dá para ler de volta — é só de escrita, por
// projeto. Então a cópia local vive no .dev.vars, que já está no .gitignore e
// é o mesmo arquivo que o `wrangler dev` usa. Escreve uma vez e esquece.
function doDevVars() {
  if (!existsSync(".dev.vars")) return null;
  for (const linha of readFileSync(".dev.vars", "utf8").split("\n")) {
    const m = linha.match(/^\s*PAINEL_SEGREDO\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const slug = process.argv[2];
const segredo = process.env.PAINEL_SEGREDO || doDevVars();

if (!slug) {
  console.error("Falta o slug.  Ex: node scripts/link-painel.mjs carlasilva");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Slug inválido: "${slug}".`);
  process.exit(1);
}
if (!segredo) {
  console.error("Falta o PAINEL_SEGREDO — o mesmo que está no Worker.");
  console.error("");
  console.error("Guarde no .dev.vars (já ignorado pelo git), numa linha:");
  console.error('  PAINEL_SEGREDO="a sua frase"');
  console.error("");
  console.error("E no Worker:  npx wrangler secret put PAINEL_SEGREDO");
  console.error("ou pelo painel: Workers & Pages > manicure-de-valor >");
  console.error("Settings > Variables and Secrets.");
  process.exit(1);
}

const chave = createHmac("sha256", segredo).update(slug).digest("hex").slice(0, 24);

console.log(`https://${slug}.manicuredevalor.com.br/painel?k=${chave}`);
console.log("");
console.log("Esse link é a senha. Mande para a profissional e peça para ela");
console.log("salvar na tela de início do celular.");
