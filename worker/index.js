import {
  RETORNO_PADRAO, DURACAO_PADRAO,
  hojeSP, agoraSP, somaDias, diasEntre,
  normFone, foneValido, acharCliente,
  lancar, jaPediu, pedidosNaUltimaHora,
  agendaEntre, pedidosAbertos, horaDeVoltar, listaDeClientes, historico,
  livresNoDia, sobramHoje,
} from "./agenda.js";

const RAIZ = ["manicuredevalor.com.br", "www.manicuredevalor.com.br"];

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
      const p = url.pathname;
      const post = request.method === "POST";
      if (p === "/api/pedido"   && post) return apiPedido(request, env, slug, url);
      if (p === "/api/horarios")         return apiHorarios(env, slug, url);
      if (p === "/api/marcar"   && post) return apiMarcar(request, env, slug, url);
      if (p === "/api/lancar"   && post) return apiLancar(request, env, slug, url);
      if (p === "/api/cliente")          return apiCliente(env, slug, url);
      if (p === "/painel")               return painel(request, env, slug, url);
    }

    // O caminho interno nunca deve aparecer na barra de endereco. Quem chegar
    // em /clientes/<slug>/ (link antigo, redirecionamento) volta para a raiz.
    if (/^\/(clientes|site)(\/|$)/i.test(url.pathname)) {
      return Response.redirect(new URL("/", url.origin).toString(), 301);
    }

    // Pede a pasta, nao o index.html: o roteador de assets normaliza
    // "/pasta/index.html" para "/pasta/" com um redirecionamento, e esse
    // redirecionamento e que vazava o caminho interno.
    const caminho = url.pathname === "/" ? "/" : url.pathname;
    const alvo = new URL(base + caminho, url.origin);
    alvo.search = url.search;   // ?utm_source e amigos seguem adiante

    let resposta = await env.ASSETS.fetch(new Request(alvo, request));

    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get("location");
      if (destino) {
        resposta = await env.ASSETS.fetch(
          new Request(new URL(destino, url.origin), request)
        );
      }
    }

    if (resposta.status === 404) {
      if (/\.[a-z0-9]{2,5}$/i.test(caminho) && !/\.html?$/i.test(caminho)) {
        return naoEncontrado();
      }
      const fallback = await env.ASSETS.fetch(
        new Request(new URL(base + "/", url.origin), request)
      );
      return fallback.status === 404 ? naoEncontrado() : fallback;
    }
    return resposta;
  },

  // Uma vez por dia, de madrugada. Telefone de cliente não fica guardado para
  // sempre: passado um ano sem atendimento, nome e telefone saem e a linha
  // vira anônima — continua servindo para entender demanda (serviço, dia,
  // horário, bairro) sem identificar ninguém. Dois anos depois sai inteira.
  //
  // Com o D1 desligado isso roda e não faz nada.
  async scheduled(evento, env, ctx) {
    if (!env.DB) return;
    const hoje = hojeSP();
    const limpeza = (async () => {
      // O fone não pode virar vazio: o índice é único por (slug, fone) e duas
      // clientes anonimizadas colidiriam. Vira um marcador único.
      await env.DB.prepare(
        `UPDATE clientes SET nome = '', fone = 'anon' || id
          WHERE fone NOT LIKE 'anon%' AND id IN (
            SELECT c.id FROM clientes c
            LEFT JOIN atendimentos a ON a.cliente_id = c.id
            GROUP BY c.id HAVING COALESCE(MAX(a.data), '0000') < ?)`
      ).bind(somaDias(hoje, -365)).run();

      await env.DB.prepare(
        `DELETE FROM atendimentos WHERE data < ?`
      ).bind(somaDias(hoje, -730)).run();

      await env.DB.prepare(
        `DELETE FROM clientes
          WHERE id NOT IN (SELECT cliente_id FROM atendimentos)`
      ).bind().run();
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(limpeza);
    return limpeza;
  },
};

/* ------------------------------------------------------------ dados.json */

async function config(env, slug, url) {
  try {
    const r = await env.ASSETS.fetch(
      new Request(new URL(`/clientes/${slug}/dados.json`, url.origin)));
    if (r.status === 200) return await r.json();
  } catch {}
  return null;
}

const SIGLAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const diaDaSemana = iso => {
  const [a, m, d] = iso.split("-").map(Number);
  return SIGLAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
};

/* ------------------------------------------------------- pedido pelo site */

// O site abre o WhatsApp de qualquer jeito: se o banco não estiver ligado,
// isso aqui responde ok:false e ninguém perde agendamento por causa disso.
async function apiPedido(request, env, slug, url) {
  if (!env.DB) return json({ ok: false, motivo: "sem banco" });

  let corpo;
  try { corpo = await request.json(); }
  catch { return json({ ok: false, motivo: "json inválido" }, 400); }

  const cfg = await config(env, slug, url);
  if (!cfg) return json({ ok: false, motivo: "cliente inexistente" }, 404);

  const corta = (v, n) => String(v ?? "").trim().slice(0, n);
  const dados = {
    nome: corta(corpo.nome, 80),
    fone: corta(corpo.fone, 30),
    servico: corta(corpo.servico, 80),
    data: corta(corpo.data, 10),
    hora: corta(corpo.hora, 5),
    bairro: corta(corpo.bairro, 60),
    onde: corta(corpo.onde, 10),
    duracao: corpo.duracao,
    retorno: cfg.diasDeRetorno,
    status: "pedido",
    origem: "site",
  };
  if (!dados.nome || !foneValido(dados.fone) || !dados.servico || !dados.data) {
    return json({ ok: false, motivo: "faltam campos" }, 400);
  }

  if (await jaPediu(env, slug, dados.fone, dados.data)) {
    return json({ ok: true, repetido: true });
  }

  // Isso aqui é um POST aberto na internet. Sem teto, qualquer um com um
  // script enche a agenda dela de pedido falso e o produto parece quebrado.
  if (await pedidosNaUltimaHora(env, slug) >= 20) {
    return json({ ok: false, motivo: "muitos pedidos" }, 429);
  }

  await lancar(env, slug, dados);
  return json({ ok: true });
}

/* --------------------------------------------------- horários disponíveis */

// O que está livre num dia. É daqui que a página de agendamento tira os
// horários, em vez de oferecer a lista fixa e deixar a cliente pedir um
// sábado que já está tomado.
async function apiHorarios(env, slug, url) {
  const cfg = await config(env, slug, url);
  if (!cfg) return json({ ok: false, motivo: "cliente inexistente" }, 404);

  const data = String(url.searchParams.get("data") || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return json({ ok: false, motivo: "data inválida" }, 400);
  }

  const grade = Array.isArray(cfg.horarios) ? cfg.horarios : [];
  const dias = Array.isArray(cfg.diasQueAtende) ? cfg.diasQueAtende : SIGLAS;
  const hoje = hojeSP();

  if (data < hoje) return json({ ok: true, horarios: [], motivo: "passado" });
  if (data < somaDias(hoje, Number(cfg.diasDeAntecedencia) || 0)) {
    return json({ ok: true, horarios: [], motivo: "antecedencia" });
  }
  if (!dias.includes(diaDaSemana(data))) {
    return json({ ok: true, horarios: [], motivo: "nao atende" });
  }

  const duracao = Number(url.searchParams.get("duracao")) > 0
    ? Math.min(Number(url.searchParams.get("duracao")), 480) : DURACAO_PADRAO;

  // Sem banco a grade inteira continua sendo oferecida: é o que acontecia
  // antes de existir agenda, e é melhor que não deixar ninguém marcar.
  let ocupados = [];
  if (env.DB) ocupados = await agendaEntre(env, slug, data, data);

  let livres = livresNoDia(grade, ocupados, duracao);
  if (data === hoje) livres = sobramHoje(livres, agoraSP(), cfg.antecedenciaHoras);

  return json({ ok: true, horarios: livres });
}

/* -------------------------------------------------------------- o painel */

async function apiCliente(env, slug, url) {
  if (!(await autorizado(env, slug, url))) return json({ ok: false }, 403);
  if (!env.DB) return json({ ok: false, motivo: "sem banco" }, 500);

  const fone = String(url.searchParams.get("fone") || "");
  if (!foneValido(fone)) return json({ ok: true, achou: false });

  const c = await acharCliente(env, slug, fone);
  if (!c) return json({ ok: true, achou: false });

  const h = await historico(env, c.id);
  const feitos = h.filter(a => a.status === "atendido");
  return json({
    ok: true, achou: true, nome: c.nome, visitas: feitos.length,
    ultimo: feitos[0] ? { servico: feitos[0].servico, data: feitos[0].data } : null,
  });
}

async function apiLancar(request, env, slug, url) {
  if (!(await autorizado(env, slug, url))) return new Response("Link inválido", { status: 403 });
  if (!env.DB) return new Response("Banco não configurado", { status: 500 });

  const form = await request.formData();
  const corta = (k, n) => String(form.get(k) ?? "").trim().slice(0, n);
  const cfg = await config(env, slug, url);

  const dados = {
    nome: corta("nome", 80),
    fone: corta("fone", 30),
    servico: corta("servico", 80),
    data: corta("data", 10),
    hora: corta("hora", 5),
    duracao: form.get("duracao"),
    retorno: cfg ? cfg.diasDeRetorno : RETORNO_PADRAO,
    // "já atendi" grava o que aconteceu; "marcar" segura o horário.
    status: corta("tipo", 10) === "feito" ? "atendido" : "confirmado",
    origem: "painel",
  };

  if (!dados.nome || !foneValido(dados.fone) || !dados.servico || !dados.data) {
    return voltaAoPainel(url, "faltou");
  }
  await lancar(env, slug, dados);
  return voltaAoPainel(url, dados.status === "atendido" ? "lancado" : "marcado");
}

async function apiMarcar(request, env, slug, url) {
  if (!(await autorizado(env, slug, url))) return new Response("Link inválido", { status: 403 });
  if (!env.DB) return new Response("Banco não configurado", { status: 500 });

  const form = await request.formData();
  const id = Number(form.get("id"));
  const acao = String(form.get("acao") || "");
  if (!id) return new Response("Atendimento não informado", { status: 400 });

  const hoje = hojeSP();
  const onde = `WHERE id = ? AND slug = ?`;

  if (acao === "atendida") {
    await env.DB.prepare(`UPDATE atendimentos SET status = 'atendido' ${onde}`)
      .bind(id, slug).run();
  } else if (acao === "confirmar") {
    await env.DB.prepare(`UPDATE atendimentos SET status = 'confirmado' ${onde}`)
      .bind(id, slug).run();
  } else if (acao === "cancelar") {
    await env.DB.prepare(`UPDATE atendimentos SET status = 'cancelado' ${onde}`)
      .bind(id, slug).run();
  } else if (acao === "chamada") {
    await env.DB.prepare(`UPDATE atendimentos SET avisada_em = ? ${onde}`)
      .bind(hoje, id, slug).run();
  } else {
    return new Response("Ação desconhecida", { status: 400 });
  }
  return voltaAoPainel(url);
}

function voltaAoPainel(url, aviso) {
  const volta = new URL("/painel", url.origin);
  volta.searchParams.set("k", url.searchParams.get("k") || "");
  if (aviso) volta.searchParams.set("aviso", aviso);
  return Response.redirect(volta.toString(), 303);
}

async function painel(request, env, slug, url) {
  if (!(await autorizado(env, slug, url))) {
    return pagina("Link inválido", `<p class="vazio">Esse link não abre esta agenda.
      Peça o link certo para quem montou seu site.</p>`, 403);
  }
  if (!env.DB) {
    return pagina("Agenda", `<p class="vazio">O banco de dados ainda não foi ligado.</p>`, 500);
  }

  const cfg = await config(env, slug, url);
  const prof = (cfg && cfg.profissional) || slug;
  const chave = url.searchParams.get("k") || "";
  const hoje = hojeSP();

  if (url.searchParams.get("ver") === "clientes") {
    return await telaClientes(env, slug, chave, prof, hoje);
  }
  return await telaAgenda(env, slug, url, chave, prof, cfg, hoje);
}

/* ---------------------------------------------------------- tela: agenda */

async function telaAgenda(env, slug, url, chave, prof, cfg, hoje) {
  const [novos, proximos, voltar] = await Promise.all([
    pedidosAbertos(env, slug, hoje),
    agendaEntre(env, slug, hoje, somaDias(hoje, 21)),
    horaDeVoltar(env, slug, hoje),
  ]);

  const confirmados = proximos.filter(a => a.status !== "pedido");
  const deHoje = confirmados.filter(a => a.data === hoje);
  const depois = confirmados.filter(a => a.data > hoje);
  const vencidos = voltar.filter(v => v.faltam <= 0);
  const semana = voltar.filter(v => v.faltam > 0 && v.faltam <= 7);

  const avisos = {
    lancado: "Atendimento lançado.",
    marcado: "Horário marcado.",
    faltou: "Faltou preencher nome, telefone, serviço ou data.",
  };
  const aviso = avisos[url.searchParams.get("aviso")];

  const corpo = `
    <h1>Sua agenda</h1>
    <p class="sub">${porExtenso(hoje)} · ${deHoje.length} hoje${
      novos.length ? ` · <b>${novos.length} pedido${novos.length === 1 ? "" : "s"} novo${novos.length === 1 ? "" : "s"}</b>` : ""}</p>
    ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}

    ${formLancar(chave, cfg, hoje)}

    ${novos.length ? secao("Pedidos novos", novos.map(a => cartaoPedido(a, chave, prof)).join(""), "novo") : ""}

    ${secao("Hoje", deHoje.length
        ? deHoje.map(a => cartaoAgenda(a, chave, prof, hoje)).join("")
        : vazio("Nada marcado para hoje."))}

    ${secao("Próximos dias", depois.length
        ? agrupaPorDia(depois, chave, prof, hoje)
        : vazio("Nada marcado pelos próximos vinte e um dias."))}

    ${secao("Hora de voltar", vencidos.length || semana.length
        ? [...vencidos, ...semana].map(v => cartaoVoltar(v, chave, prof)).join("")
        : vazio("Ninguém vencido. Bom sinal."))}

    <p class="rodape">
      <a href="/painel?k=${encodeURIComponent(chave)}&ver=clientes">Ver todas as clientes →</a><br><br>
      Guardamos nome, telefone e o que foi feito, só para a sua agenda e o lembrete.
      Passado um ano sem atendimento, o contato é apagado sozinho.</p>`;

  return pagina(`Agenda · ${prof}`, corpo);
}

const secao = (titulo, dentro, tom = "") =>
  `<section class="${tom}"><h2>${titulo}</h2>${dentro}</section>`;

const vazio = t => `<p class="vazio">${t}</p>`;

function agrupaPorDia(lista, chave, prof, hoje) {
  const dias = [];
  for (const a of lista) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.data === a.data) ultimo.itens.push(a);
    else dias.push({ data: a.data, itens: [a] });
  }
  return dias.map(d => `
    <h3>${esc(porExtenso(d.data))}${
      diasEntre(hoje, d.data) === 1 ? " <i>amanhã</i>" : ""}</h3>
    ${d.itens.map(a => cartaoAgenda(a, chave, prof, hoje)).join("")}`).join("");
}

function cartaoAgenda(a, chave, prof, hoje) {
  const quando = a.hora ? `${a.hora}` : "sem horário";
  const local = a.onde === "recebo" ? "no seu espaço"
              : a.bairro ? esc(a.bairro) : "";
  const texto = `Oi, ${a.nome}! Aqui é a ${prof}. Confirmando ${
    a.data === hoje ? "hoje" : porExtenso(a.data)}${a.hora ? " às " + a.hora : ""} — ${a.servico}.`;
  return `
    <article class="cartao">
      <div class="quem"><em>${esc(quando)}</em><b>${esc(a.nome)}</b></div>
      <p class="quando">${esc(a.servico)}${local ? " · " + local : ""}</p>
      <div class="acoes">
        ${a.status !== "atendido" ? botao(chave, a.id, "atendida", "Atendi") : `<span class="feito">atendida</span>`}
        <a class="b b-line" href="https://wa.me/${a.fone}?text=${encodeURIComponent(texto)}"
           target="_blank" rel="noopener">Chamar</a>
        ${a.status !== "atendido" ? botao(chave, a.id, "cancelar", "Cancelar") : ""}
      </div>
    </article>`;
}

function cartaoPedido(a, chave, prof) {
  const local = a.onde === "recebo" ? "no seu espaço" : a.bairro ? esc(a.bairro) : "";
  const texto = `Oi, ${a.nome}! Aqui é a ${prof}. Recebi seu pedido para ${
    porExtenso(a.data)}${a.hora ? " às " + a.hora : ""} — ${a.servico}. Confirmo pra você?`;
  return `
    <article class="cartao novo">
      <div class="quem"><b>${esc(a.nome)}</b></div>
      <p class="quando">pediu ${esc(porExtenso(a.data))}${a.hora ? " às " + esc(a.hora) : ""} · ${esc(a.servico)}${local ? " · " + local : ""}</p>
      <div class="acoes">
        <a class="b b-zap" href="https://wa.me/${a.fone}?text=${encodeURIComponent(texto)}"
           target="_blank" rel="noopener"
           onclick="document.getElementById('c${a.id}').submit()">Chamar no WhatsApp</a>
        ${botao(chave, a.id, "confirmar", "Confirmar")}
        ${botao(chave, a.id, "cancelar", "Recusar")}
      </div>
      <form id="c${a.id}" method="POST" action="/api/marcar?k=${encodeURIComponent(chave)}" class="oculto">
        <input type="hidden" name="id" value="${a.id}"><input type="hidden" name="acao" value="chamada">
      </form>
    </article>`;
}

function cartaoVoltar(v, chave, prof) {
  const texto = `Oi, ${v.nome}! Aqui é a ${prof}. Já deu ${semanas(v.dias)} desde a sua última ${
    String(v.servico).toLowerCase()} — quer marcar a manutenção? Me diz um dia que eu te encaixo.`;
  const quanto = v.faltam <= 0
    ? `faz ${v.dias} dias · passou ${-v.faltam} do prazo`
    : `faz ${v.dias} dias · vence em ${v.faltam}`;
  return `
    <article class="cartao ${v.faltam <= 0 ? "urgente" : "logo"}">
      <div class="quem"><b>${esc(v.nome)}</b><span>${esc(v.servico)}</span></div>
      <p class="quando">${esc(quanto)}${
        v.avisada_em ? ` <span class="ja">já chamada em ${esc(porExtenso(v.avisada_em))}</span>` : ""}</p>
      <div class="acoes">
        <a class="b b-zap" href="https://wa.me/${v.fone}?text=${encodeURIComponent(texto)}"
           target="_blank" rel="noopener"
           onclick="document.getElementById('v${v.atendimento_id}').submit()">Chamar no WhatsApp</a>
      </div>
      <form id="v${v.atendimento_id}" method="POST" action="/api/marcar?k=${encodeURIComponent(chave)}" class="oculto">
        <input type="hidden" name="id" value="${v.atendimento_id}">
        <input type="hidden" name="acao" value="chamada">
      </form>
    </article>`;
}

// A entrada manual. É ela que faz o painel servir no primeiro dia: sem isso,
// a agenda só conhece quem veio pelo site, e a clientela que ela já tem fica
// invisível por meses.
function formLancar(chave, cfg, hoje) {
  const servicos = (cfg && Array.isArray(cfg.servicos) ? cfg.servicos : [])
    .map(s => `<option value="${esc(s.nome)}" data-duracao="${Number(s.duracao) || DURACAO_PADRAO}">`).join("");
  return `
  <details class="lancar">
    <summary>+ Lançar atendimento</summary>
    <form method="POST" action="/api/lancar?k=${encodeURIComponent(chave)}">
      <div class="tipo">
        <label><input type="radio" name="tipo" value="feito" checked> Já atendi</label>
        <label><input type="radio" name="tipo" value="marcar"> Marcar horário</label>
      </div>
      <input name="fone" id="fone" type="tel" placeholder="WhatsApp dela" required autocomplete="off">
      <p id="achou" class="achou" hidden></p>
      <input name="nome" id="nome" type="text" placeholder="Nome" required autocomplete="off">
      <input name="servico" type="text" placeholder="Serviço" list="servicos" required autocomplete="off">
      <datalist id="servicos">${servicos}</datalist>
      <div class="dupla">
        <input name="data" type="date" value="${hoje}" required>
        <input name="hora" type="time">
      </div>
      <button class="b b-zap" type="submit">Salvar</button>
    </form>
  </details>
  <script>
  (function(){
    var f=document.getElementById('fone'), n=document.getElementById('nome'),
        a=document.getElementById('achou');
    if(!f) return;
    f.addEventListener('blur', function(){
      var v=f.value.replace(/\\D/g,'');
      if(v.length<10){ a.hidden=true; return; }
      fetch('/api/cliente?k=${encodeURIComponent(chave)}&fone='+encodeURIComponent(f.value))
        .then(function(r){return r.json()})
        .then(function(d){
          if(!d || !d.achou){ a.hidden=true; return; }
          if(!n.value) n.value=d.nome;
          a.hidden=false;
          a.textContent=d.ultimo
            ? d.nome+' · '+d.visitas+' atendimento'+(d.visitas===1?'':'s')+' · última: '+d.ultimo.servico
            : d.nome+' · já cadastrada';
        }).catch(function(){});
    });
  })();
  </script>`;
}

/* -------------------------------------------------------- tela: clientes */

async function telaClientes(env, slug, chave, prof, hoje) {
  const lista = await listaDeClientes(env, slug);
  const linhas = lista.map(c => `
    <article class="cartao">
      <div class="quem"><b>${esc(c.nome || "—")}</b>
        <span>${c.visitas} atendimento${c.visitas === 1 ? "" : "s"}</span></div>
      <p class="quando">${c.ultimo_servico
        ? `${esc(c.ultimo_servico)} · ${esc(porExtenso(c.ultima_data))} (faz ${diasEntre(c.ultima_data, hoje)} dias)`
        : "ainda não foi atendida"}</p>
      ${String(c.fone).startsWith("anon") ? "" : `
      <div class="acoes">
        <a class="b b-line" href="https://wa.me/${esc(c.fone)}" target="_blank" rel="noopener">Abrir conversa</a>
      </div>`}
    </article>`).join("");

  return pagina(`Clientes · ${prof}`, `
    <h1>Suas clientes</h1>
    <p class="sub">${lista.length} no total</p>
    ${lista.length ? linhas : vazio("Nenhuma cliente ainda. Lance o primeiro atendimento na agenda.")}
    <p class="rodape"><a href="/painel?k=${encodeURIComponent(chave)}">← Voltar para a agenda</a></p>`);
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

const esc = t => String(t ?? "").replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function semanas(dias) {
  const s = Math.round(dias / 7);
  if (s < 1) return `${dias} dias`;
  return s === 1 ? "uma semana" : `${s} semanas`;
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
.sub{color:#866d65;font-size:16px;margin-bottom:22px}
.sub b{color:#171110}
.aviso{background:#171110;color:#fff7f2;border-radius:12px;padding:11px 15px;
       font-size:15px;margin-bottom:20px}
section{margin-bottom:32px}
h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#866d65;margin-bottom:12px}
h3{font-size:15px;color:#171110;margin:18px 0 10px}
h3 i{font-style:normal;color:#866d65;font-weight:400}
.cartao{background:#fff;border:1px solid #efe0d7;border-radius:16px;padding:15px 17px;
        margin-bottom:10px}
.cartao.urgente{border-left:4px solid #c05267}
.cartao.logo{border-left:4px solid #e8b4a0}
.cartao.novo{border-left:4px solid #171110}
.quem{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.quem em{font-style:normal;font-variant-numeric:tabular-nums;font-weight:600;font-size:17px}
.quem b{font-size:19px;letter-spacing:-.02em}
.quem span{color:#866d65;font-size:15px}
.quando{color:#866d65;font-size:15px;margin-top:3px}
.ja{color:#a08c84;font-size:14px}
.feito{color:#866d65;font-size:15px}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px;align-items:center}
.b{font:500 15px/1 inherit;cursor:pointer;border:none;text-decoration:none;display:inline-block;
   border-radius:999px;padding:11px 18px}
.b-zap{background:#c05267;color:#fff}
.b-line{background:transparent;color:#171110;box-shadow:inset 0 0 0 1.5px #efe0d7}
.linha{display:inline}
.oculto{display:none}
.vazio{color:#866d65;font-size:16px;background:#fbe0d6;border-radius:14px;padding:14px 16px}
.rodape{color:#866d65;font-size:14px;border-top:1px solid #efe0d7;padding-top:16px;margin-top:26px}
.rodape a{color:#c05267}
.lancar{background:#fff;border:1px solid #efe0d7;border-radius:16px;margin-bottom:28px}
.lancar summary{padding:15px 17px;cursor:pointer;font-weight:500;list-style:none}
.lancar summary::-webkit-details-marker{display:none}
.lancar[open] summary{border-bottom:1px solid #efe0d7}
.lancar form{padding:15px 17px;display:flex;flex-direction:column;gap:10px}
.lancar input[type=text],.lancar input[type=tel],.lancar input[type=date],.lancar input[type=time]{
  font:16px inherit;padding:12px 14px;border:1px solid #efe0d7;border-radius:11px;
  background:#fff7f2;color:#171110;width:100%}
.tipo{display:flex;gap:16px;font-size:15px;color:#866d65}
.tipo label{display:flex;align-items:center;gap:6px;cursor:pointer}
.dupla{display:flex;gap:10px}
.achou{font-size:14px;color:#c05267;margin-top:-4px}
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
     display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px}
     a{color:#c05267}</style>
     <div><h1>Esse endereço não existe</h1>
     <p>Confira o link ou visite <a href="https://manicuredevalor.com.br">manicuredevalor.com.br</a>.</p></div>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
}
