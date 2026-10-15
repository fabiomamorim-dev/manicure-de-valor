#!/usr/bin/env node
// Gera o link privado da agenda de uma profissional.
//
//   node scripts/link-painel.mjs carlasilva
//
// Sai um token novo, o SQL para gravá-lo e o link pronto. Não existe segredo
// para guardar: quem manda é a linha no banco. Rodar de novo para a mesma
// profissional gera um token novo e invalida o link antigo — é assim que se
// revoga, se ela perder o celular ou parar de ser cliente.
//
// O SQL roda no console do D1 (painel da Cloudflare) ou por:
//   npx wrangler d1 execute manicure-de-valor --remote --command "<o SQL>"

import { randomBytes } from "node:crypto";

const slug = process.argv[2];

if (!slug) {
  console.error("Falta o slug.  Ex: node scripts/link-painel.mjs carlasilva");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Slug inválido: "${slug}". Use só letras minúsculas, números e hífen.`);
  process.exit(1);
}

// 32 caracteres hex. Não dá para adivinhar e cabe num link que ela vai
// salvar na tela de início do celular.
const token = randomBytes(16).toString("hex");
const agora = new Date().toISOString().slice(0, 19).replace("T", " ");

const sql = `INSERT INTO profissionais (slug, token, criado_em) VALUES ('${slug}', '${token}', '${agora}') ` +
            `ON CONFLICT(slug) DO UPDATE SET token = excluded.token, criado_em = excluded.criado_em;`;

console.log("\n1 · Rode isto no console do D1:\n");
console.log(sql);
console.log("\n2 · E mande este link para ela:\n");
console.log(`https://${slug}.manicuredevalor.com.br/painel?k=${token}`);
console.log(`
Esse link é a senha. Mande pela conversa dela e peça para salvar na tela
de início do celular. Rodar este comando de novo troca o token e derruba
o link antigo — só o dela, as outras continuam valendo.
`);
