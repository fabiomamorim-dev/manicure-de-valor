const RAIZ = ["manicuredevalor.com.br", "www.manicuredevalor.com.br"];

// Quantos dias, por padrão, até a manutenção. Cada cliente pode ter o seu
// em dados.json (diasDeRetorno) — o valor chega aqui junto com o pedido.
const RETORNO_PADRAO = 21;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // manicuredevalor.com.br  →  /site
    // carlasilva.manicuredevalor.com.br  →  /clientes/carlasilva
    let base, slug = "";
    if (RAIZ.includes(host) || host.endsWith(".workers.dev")) {
      base = "/site";
    } else {
      slug = host.split(".")[0];
      if (!/^[a-z0-9-]+$/.test(slug)) return naoEncontrado();
      base = `/clientes/${slug}`;
    }

    // Rotas de dados vêm antes dos arquivos. Só existem no site de um cliente.
    if (slug) {
      if (url.pathname === "/api/pedido" && request.method === "POST") {
        return apiPedido(request, env, slug, url);
      }
      if (url.pathname === "/api/marcar" && request.method === "POST") {
        return apiMarcar(request, env, slug, url);
      }
      if (url.pathname === "/painel") {
        return painel(request, env, slug, url);
      }
    }

    const caminho = url.pathname === "/" ? "/index.html" : url.pathname;
    const alvo = new URL(base + caminho, url.origin);

    const resposta = await env.ASSETS.fetch(new Request(alvo, request));
    if (resposta.status === 404) {
      // Arquivo que não existe (foto, css, ícone) é 404 de verdade. Devolver o
      // index.html no lugar de uma imagem só esconde o erro atrás de um 200.
      if (/\.[a-z0-9]{2,5}$/i.test(caminho) && !/\.html?$/i.test(caminho)) {
        return naoEncontrado();
      }
      // rota interna desconhecida cai no index do próprio site
      const fallback = await env.ASSETS.fetch(
        new Request(new URL(base + "/index.html", url.origin), request)
      );
      return fallback.status === 404 ? naoEncontrado() : fallback;
    }
    return resposta;
  },
};

/* ---------------------------------------------------------------- pedidos */

// O site abre o WhatsApp de qualquer jeito: se o banco não estiver ligado,
// isso aqui responde ok:false e ninguém perde agendamento por causa disso.
async function apiPedido(request, env, slug, url) {
  if (!env.DB) return json({ ok: false, motivo: "sem banco" });

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ ok: false, motivo: "json inválido" }, 400);
  }

  // Subdomínio que não tem site não vira linha no banco.
  const existe = await env.ASSETS.fetch(
    new Request(new URL(`/clientes/${slug}/index.html`, url.origin))
  );
  if (existe.status === 404) return json({ ok: false, motivo: "cliente inexistente" }, 404);

  const corta = (v, n) => String(v ?? "").trim().slice(0, n);
  const linha = {
    nome: corta(corpo.nome, 80),
    fone: corta(corpo.fone, 30),
    servico: corta(corpo.servico, 80),
    data: corta(corpo.data, 10),
    hora: corta(corpo.hora, 5),
    bairro: corta(corpo.bairro, 60),
    retorno: Number(corpo.retorno) > 0 ? Math.min(Number(corpo.retorno), 180) : RETORNO_PADRAO,
  };
  if (!linha.nome || !linha.fone || !linha.servico || !linha.data) {
    return json({ ok: false, motivo: "faltam campos" }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO pedidos (slug, nome, fone, servico, data, hora, bairro, retorno, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pedido', datetime('now'))`
  ).bind(slug, linha.nome, linha.fone, linha.servico, linha.data, linha.hora,
         linha.bairro, linha.retorno).run();

  return json({ ok: true });
}

async function apiMarcar(request, env, slug, url) {
  if (!(await autorizado(env, slug, url))) return new Response("Link inválido", { status: 403 });
  if (!env.DB) return new Response("Banco não configurado", { status: 500 });

  const form = await request.formData();
  const id = Number(form.get("id"));
  const acao = String(form.get("acao") || "");
  if (!id) return new Response("Pedido não informado", { status: 400 });

  if (acao === "atendida") {
    // A data do atendimento é a data marcada, não a de hoje: ela pode
    // confirmar depois, e o proximo lembrete tem que contar do atendimento.
    await env.DB.prepare(
      `UPDATE pedidos SET status='atendida', atendida_em=COALESCE(data, date('now'))
       WHERE id=? AND slug=?`).bind(id, slug).run();
  } else if (acao === "chamada") {
    await env.DB.prepare(
      `UPDATE pedidos SET avisada_em=date('now') WHERE id=? AND slug=?`).bind(id, slug).run();
  } else if (acao === "arquivar") {
    await env.DB.prepare(
      `UPDATE pedidos SET status='arquivada' WHERE id=? AND slug=?`).bind(id, slug).run();
  } else {
    return new Response("Ação desconhecida", { status: 400 });
  }

  const volta = new URL("/painel", url.origin);
  volta.searchParams.set("k", url.searchParams.get("k") || "");
  return Response.redirect(volta.toString(), 303);
}

/* ----------------------------------------------------------------- painel */

async function painel(request, env, slug, url) {
  if (!(await autorizado(env, slug, url))) {
    return pagina("Link inválido", `<p class="vazio">Esse link não abre este painel.
      Peça o link certo para quem montou seu site.</p>`, 403);
  }
  if (!env.DB) {
    return pagina("Painel", `<p class="vazio">O banco de dados ainda não foi ligado.</p>`, 500);
  }

  const chave = url.searchParams.get("k") || "";
  const { results } = await env.DB.prepare(
    `SELECT id, nome, fone, servico, data, hora, status, atendida_em, avisada_em,
            retorno,
            CAST(julianday('now') - julianday(COALESCE(atendida_em, data)) AS INTEGER) AS dias
     FROM pedidos
     WHERE slug = ? AND status != 'arquivada'
     ORDER BY COALESCE(atendida_em, data) DESC
     LIMIT 300`
  ).bind(slug).all();

  const prof = await nomeDaProfissional(env, slug, url);

  const chamar = [], semana = [], novos = [], emDia = [];
  for (const p of results || []) {
    if (p.status === "pedido") {
      novos.push(p);
      continue;
    }
    const faltam = (p.retorno || RETORNO_PADRAO) - (p.dias ?? 0);
    p.faltam = faltam;
    if (faltam <= 0) chamar.push(p);
    else if (faltam <= 7) semana.push(p);
    else emDia.push(p);
  }
  chamar.sort((a, b) => a.faltam - b.faltam);
  semana.sort((a, b) => a.faltam - b.faltam);

  const cartao = (p, tom) => {
    const quando = p.status === "pedido"
      ? `pediu para ${porExtenso(p.data)}${p.hora ? " às " + p.hora : ""}`
      : `atendida em ${porExtenso(p.atendida_em)} · faz ${p.dias} dia${p.dias === 1 ? "" : "s"}`;
    const aviso = p.avisada_em ? `<span class="ja">já chamada em ${porExtenso(p.avisada_em)}</span>` : "";
    const texto = p.status === "pedido"
      ? `Oi, ${p.nome}! Aqui é a ${prof}. Recebi seu pedido para ${porExtenso(p.data)}${p.hora ? " às " + p.hora : ""} — ${p.servico}. Confirmo pra você?`
      : `Oi, ${p.nome}! Aqui é a ${prof}. Já deu ${semanas(p.dias)} desde a sua última ${minuscula(p.servico)} — quer marcar a manutenção? Me diz um dia que eu te encaixo.`;
    const link = `https://wa.me/${fone(p.fone)}?text=${encodeURIComponent(texto)}`;
    return `
      <li class="cartao ${tom}">
        <div class="quem"><b>${esc(p.nome)}</b><span>${esc(p.servico)}</span></div>
        <p class="quando">${esc(quando)} ${aviso}</p>
        <div class="acoes">
          <a class="b b-zap" href="${link}" target="_blank" rel="noopener"
             onclick="document.getElementById('chamada-${p.id}').submit()">Chamar no WhatsApp</a>
          ${botao(chave, p.id, p.status === "pedido" ? "atendida" : "atendida",
                  p.status === "pedido" ? "Confirmei o atendimento" : "Atendi de novo")}
          ${botao(chave, p.id, "arquivar", "Arquivar")}
        </div>
        <form id="chamada-${p.id}" method="POST" action="/api/marcar?k=${encodeURIComponent(chave)}" class="oculto">
          <input type="hidden" name="id" value="${p.id}"><input type="hidden" name="acao" value="chamada">
        </form>
      </li>`;
  };

  const bloco = (titulo, lista, tom, vazio) => `
    <section>
      <h2>${titulo} ${lista.length ? `<i>${lista.length}</i>` : ""}</h2>
      ${lista.length ? `<ul>${lista.map(p => cartao(p, tom)).join("")}</ul>`
                     : `<p class="vazio">${vazio}</p>`}
    </section>`;

  const corpo = `
    <h1>Manutenção</h1>
    <p class="sub">Quem já está na hora de voltar, e quem pediu horário e ainda não foi atendida.</p>
    ${bloco("Chamar agora", chamar, "urgente", "Ninguém vencido. Bom sinal.")}
    ${bloco("Vence essa semana", semana, "logo", "Nada vencendo nos próximos sete dias.")}
    ${bloco("Pedidos novos", novos, "novo", "Nenhum pedido novo pelo site.")}
    <p class="rodape">${emDia.length} cliente${emDia.length === 1 ? "" : "s"} em dia.
       Guardamos nome, telefone e o que foi feito, só para esse lembrete.
       Arquivar tira do painel.</p>`;

  return pagina(`Manutenção · ${prof}`, corpo);
}

function botao(chave, id, acao, rotulo) {
  return `<form method="POST" action="/api/marcar?k=${encodeURIComponent(chave)}" class="linha">
      <input type="hidden" name="id" value="${id}">
      <input type="hidden" name="acao" value="${acao}">
      <button class="b b-line" type="submit">${rotulo}</button>
    </form>`;
}

/* ------------------------------------------------------------------ apoio */

// O link do painel é HMAC do slug com um segredo do Worker: nada para guardar,
// e o link de uma profissional não abre o painel de outra.
async function autorizado(env, slug, url) {
  const chave = url.searchParams.get("k") || "";
  if (!env.PAINEL_SEGREDO || !chave) return false;
  const esperado = await token(slug, env.PAINEL_SEGREDO);
  if (chave.length !== esperado.length) return false;
  let iguais = 0;
  for (let i = 0; i < esperado.length; i++) iguais |= chave.charCodeAt(i) ^ esperado.charCodeAt(i);
  return iguais === 0;
}

async function token(slug, segredo) {
  const cripto = crypto.subtle;
  const chave = await cripto.importKey("raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await cripto.sign("HMAC", chave, new TextEncoder().encode(slug));
  return [...new Uint8Array(assinatura)].slice(0, 12)
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function nomeDaProfissional(env, slug, url) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(`/clientes/${slug}/dados.json`, url.origin)));
    if (r.status === 200) {
      const d = await r.json();
      if (d && d.profissional) return String(d.profissional);
    }
  } catch {}
  return slug;
}

const esc = t => String(t ?? "").replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const minuscula = t => String(t ?? "").toLowerCase();

function semanas(dias) {
  const s = Math.round(dias / 7);
  if (s < 1) return `${dias} dias`;
  return s === 1 ? "uma semana" : `${s} semanas`;
}

function fone(bruto) {
  const so = String(bruto ?? "").replace(/\D/g, "");
  if (so.length >= 12) return so;
  return "55" + so;
}

function porExtenso(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  const M = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  if (!m || !d) return iso;
  return `${Number(d)} de ${M[Number(m) - 1]}`;
}

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });

function pagina(titulo, corpo, status = 200) {
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff7f2;color:#171110;font:17px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;
     padding:26px 18px 60px;max-width:640px;margin:0 auto}
h1{font-size:31px;letter-spacing:-.03em;margin-bottom:4px}
.sub{color:#866d65;font-size:16px;margin-bottom:30px}
section{margin-bottom:34px}
h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#866d65;margin-bottom:12px;
   display:flex;align-items:center;gap:8px}
h2 i{font-style:normal;background:#171110;color:#fff7f2;font-size:12px;letter-spacing:0;
     border-radius:999px;padding:2px 9px}
ul{list-style:none;display:flex;flex-direction:column;gap:12px}
.cartao{background:#fff;border:1px solid #efe0d7;border-radius:16px;padding:16px 18px}
.cartao.urgente{border-left:4px solid #e02e49}
.cartao.logo{border-left:4px solid #f5cd67}
.cartao.novo{border-left:4px solid #171110}
.quem{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.quem b{font-size:19px;letter-spacing:-.02em}
.quem span{color:#866d65;font-size:15px}
.quando{color:#866d65;font-size:15px;margin-top:3px}
.ja{color:#a08c84;font-size:14px}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
.b{font:500 15px/1 inherit;cursor:pointer;border:none;text-decoration:none;display:inline-block;
   border-radius:999px;padding:11px 18px}
.b-zap{background:#e02e49;color:#fff}
.b-line{background:transparent;color:#171110;box-shadow:inset 0 0 0 1.5px #efe0d7}
.b-line:hover{background:#fbe0d6}
.linha{display:inline}
.oculto{display:none}
.vazio{color:#866d65;font-size:16px;background:#fbe0d6;border-radius:14px;padding:14px 16px}
.rodape{color:#866d65;font-size:14px;border-top:1px solid #efe0d7;padding-top:16px;margin-top:30px}
</style>
${corpo}
</html>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function naoEncontrado() {
  return new Response(
    `<!doctype html><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Site não encontrado</title>
     <style>body{font-family:system-ui;background:#fbf7f5;color:#2b1d24;
     display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
     a{color:#c05a76}</style>
     <div><h1>Esse endereço não existe</h1>
     <p>Confira o link ou volte para
     <a href="https://manicuredevalor.com.br">manicuredevalor.com.br</a>.</p></div>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
