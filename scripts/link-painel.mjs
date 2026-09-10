#!/usr/bin/env node
// Gera o link privado do painel de manutenção de uma profissional.
//
//   PAINEL_SEGREDO="o mesmo segredo do worker" node scripts/link-painel.mjs carlasilva
//
// O link não fica guardado em lugar nenhum: é uma assinatura do slug com o
// segredo. Trocar o segredo invalida todos os links de uma vez.

import { createHmac } from "node:crypto";

const slug = process.argv[2];
const segredo = process.env.PAINEL_SEGREDO;

if (!slug) {
  console.error("Falta o slug.  Ex: node scripts/link-painel.mjs carlasilva");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Slug inválido: "${slug}".`);
  process.exit(1);
}
if (!segredo) {
  console.error("Falta a variável PAINEL_SEGREDO — a mesma que está no Worker.");
  console.error("No Worker:  npx wrangler secret put PAINEL_SEGREDO");
  process.exit(1);
}

const chave = createHmac("sha256", segredo).update(slug).digest("hex").slice(0, 24);

console.log(`https://${slug}.manicuredevalor.com.br/painel?k=${chave}`);
console.log("");
console.log("Esse link é a senha. Mande para a profissional e peça para ela");
console.log("salvar na tela de início do celular.");
