// Tudo que mexe no banco da agenda. O index.js cuida de rota e de HTML; aqui
// ficam as consultas, para dar para testar uma coisa sem subir a outra.

export const RETORNO_PADRAO = 21;
export const DURACAO_PADRAO = 60;

// Os estados que ocupam horário. "pedido" ocupa de propósito: se não ocupasse,
// duas clientes pediriam o mesmo sábado às 14h antes de ela abrir o painel.
export const OCUPAM = ["pedido", "confirmado", "atendido"];

/* ------------------------------------------------------------------ datas */

// O Worker roda em UTC. Depois das 21h de Brasília, date('now') do SQLite já
// virou o dia seguinte — então "hoje" tem que ser calculado no fuso daqui e
// passado como parâmetro, nunca deixado para o banco decidir.
export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

export function agoraSP(agora = new Date()) {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(agora);
  return h;                                   // "14:30"
}

export const somaDias = (iso, n) => {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

export const diasEntre = (de, ate) => {
  const n = iso => { const [a, m, d] = iso.split("-").map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((n(ate) - n(de)) / 864e5);
};

const emMinutos = hhmm => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const emHora = min =>
  String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

/* ---------------------------------------------------------------- clientes */

// "(41) 99999-8888" e "41999998888" têm que cair na mesma pessoa, senão o
// histórico não casa e a mesma cliente vira duas.
export function normFone(bruto) {
  let so = String(bruto ?? "").replace(/\D/g, "");
  so = so.replace(/^0+/, "");
  if (so.length >= 12 && so.startsWith("55")) return so;
  if (so.length === 10 || so.length === 11) return "55" + so;
  return so;
}

export const foneValido = f => /^55\d{10,11}$/.test(normFone(f));

export async function acharCliente(env, slug, fone) {
  const { results } = await env.DB.prepare(
    `SELECT id, nome, fone, obs FROM clientes WHERE slug = ? AND fone = ? LIMIT 1`
  ).bind(slug, normFone(fone)).all();
  return (results && results[0]) || null;
}

// Devolve o id da cliente, criando se for a primeira vez. Se ela já existe e
// veio um nome diferente, o nome novo vale: normalmente é ela corrigindo um
// jeito de escrever, não uma pessoa nova.
export async function garantirCliente(env, slug, nome, fone, criadoEm) {
  const f = normFone(fone);
  const achada = await acharCliente(env, slug, f);
  if (achada) {
    if (nome && nome !== achada.nome) {
      await env.DB.prepare(`UPDATE clientes SET nome = ? WHERE id = ?`).bind(nome, achada.id).run();
    }
    return achada.id;
  }
  await env.DB.prepare(
    `INSERT INTO clientes (slug, nome, fone, criado_em) VALUES (?, ?, ?, ?)`
  ).bind(slug, nome, f, criadoEm).run();
  const { results } = await env.DB.prepare(
    `SELECT id FROM clientes WHERE slug = ? AND fone = ? LIMIT 1`
  ).bind(slug, f).all();
  return results && results[0] ? results[0].id : null;
}

/* ------------------------------------------------------------ atendimentos */

export async function lancar(env, slug, dados) {
  const criadoEm = new Date().toISOString().slice(0, 19).replace("T", " ");
  const clienteId = await garantirCliente(env, slug, dados.nome, dados.fone, criadoEm);
  if (!clienteId) return null;

  await env.DB.prepare(
    `INSERT INTO atendimentos
       (slug, cliente_id, servico, duracao, data, hora, bairro, onde, status, retorno, origem, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    slug, clienteId, dados.servico,
    Number(dados.duracao) > 0 ? Math.min(Number(dados.duracao), 480) : DURACAO_PADRAO,
    dados.data, dados.hora || null, dados.bairro || null, dados.onde || null,
    dados.status || "pedido",
    Number(dados.retorno) > 0 ? Math.min(Number(dados.retorno), 180) : RETORNO_PADRAO,
    dados.origem || "site", criadoEm
  ).run();
  return clienteId;
}

// Um pedido igual, da mesma pessoa, para o mesmo dia, não vira duas linhas.
// Resolve o clique duplo e a página recarregada, que é o caso real.
export async function jaPediu(env, slug, fone, data) {
  const { results } = await env.DB.prepare(
    `SELECT a.id FROM atendimentos a JOIN clientes c ON c.id = a.cliente_id
      WHERE a.slug = ? AND c.fone = ? AND a.data = ? AND a.status = 'pedido' LIMIT 1`
  ).bind(slug, normFone(fone), data).all();
  return !!(results && results.length);
}

export async function pedidosNaUltimaHora(env, slug) {
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM atendimentos
      WHERE slug = ? AND criado_em > datetime('now', '-1 hour')`
  ).bind(slug).all();
  return (results && results[0] && results[0].n) || 0;
}

/* -------------------------------------------------------------- a agenda */

// Os atendimentos de um intervalo, com quem é a cliente junto.
export async function agendaEntre(env, slug, de, ate) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.servico, a.duracao, a.data, a.hora, a.bairro, a.onde, a.status,
            a.retorno, a.avisada_em, a.origem, c.id AS cliente_id, c.nome, c.fone
       FROM atendimentos a JOIN clientes c ON c.id = a.cliente_id
      WHERE a.slug = ? AND a.data >= ? AND a.data <= ? AND a.status != 'cancelado'
      ORDER BY a.data, COALESCE(a.hora, '99:99')`
  ).bind(slug, de, ate).all();
  return results || [];
}

export async function pedidosAbertos(env, slug, hoje) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.servico, a.data, a.hora, a.bairro, a.onde, a.origem,
            c.id AS cliente_id, c.nome, c.fone
       FROM atendimentos a JOIN clientes c ON c.id = a.cliente_id
      WHERE a.slug = ? AND a.status = 'pedido' AND a.data >= ?
      ORDER BY a.data, COALESCE(a.hora, '99:99')`
  ).bind(slug, hoje).all();
  return results || [];
}

// Quem já passou do prazo de manutenção. Uma linha por cliente: o último
// atendimento que de fato aconteceu é o que conta.
export async function horaDeVoltar(env, slug, hoje) {
  const { results } = await env.DB.prepare(
    `SELECT c.id AS cliente_id, c.nome, c.fone,
            u.servico, u.data AS ultima, u.retorno, u.avisada_em, u.id AS atendimento_id
       FROM clientes c
       JOIN atendimentos u ON u.id = (
            SELECT id FROM atendimentos
             WHERE cliente_id = c.id AND status = 'atendido'
             ORDER BY data DESC, id DESC LIMIT 1)
      WHERE c.slug = ?
        AND NOT EXISTS (
            SELECT 1 FROM atendimentos f
             WHERE f.cliente_id = c.id AND f.data > u.data
               AND f.status IN ('pedido','confirmado'))`
  ).bind(slug).all();

  return (results || []).map(r => {
    const dias = diasEntre(r.ultima, hoje);
    return { ...r, dias, faltam: (r.retorno || RETORNO_PADRAO) - dias };
  }).sort((a, b) => a.faltam - b.faltam);
}

export async function listaDeClientes(env, slug) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nome, c.fone, c.obs,
            (SELECT COUNT(*) FROM atendimentos a
              WHERE a.cliente_id = c.id AND a.status = 'atendido') AS visitas,
            (SELECT a.servico FROM atendimentos a
              WHERE a.cliente_id = c.id AND a.status = 'atendido'
              ORDER BY a.data DESC, a.id DESC LIMIT 1) AS ultimo_servico,
            (SELECT a.data FROM atendimentos a
              WHERE a.cliente_id = c.id AND a.status = 'atendido'
              ORDER BY a.data DESC, a.id DESC LIMIT 1) AS ultima_data
       FROM clientes c WHERE c.slug = ?
      ORDER BY COALESCE(ultima_data, '0000') DESC, c.nome`
  ).bind(slug).all();
  return results || [];
}

export async function historico(env, clienteId) {
  const { results } = await env.DB.prepare(
    `SELECT servico, data, hora, status FROM atendimentos
      WHERE cliente_id = ? ORDER BY data DESC, id DESC LIMIT 40`
  ).bind(clienteId).all();
  return results || [];
}

/* ------------------------------------------------------- horários livres */

// O que sobra num dia: a grade da profissional menos o que já está ocupado,
// considerando quanto tempo cada atendimento leva.
//
// `grade`    lista de horários do dados.json, ex ["08:00","09:00",...]
// `ocupados` atendimentos daquele dia, com hora e duracao
// `duracao`  quanto o serviço que a cliente quer vai levar
export function livresNoDia(grade, ocupados, duracao = DURACAO_PADRAO) {
  const blocos = (ocupados || [])
    .filter(o => o.hora)
    .map(o => {
      const i = emMinutos(o.hora);
      return [i, i + (Number(o.duracao) > 0 ? Number(o.duracao) : DURACAO_PADRAO)];
    });

  // Até onde o dia vai: o último horário da grade mais a duração padrão. Sem
  // isso, um serviço de duas horas no último horário passaria do expediente.
  const fim = grade.length
    ? emMinutos(grade[grade.length - 1]) + DURACAO_PADRAO
    : 24 * 60;

  return grade.filter(h => {
    const i = emMinutos(h), f = i + duracao;
    if (f > fim) return false;
    return !blocos.some(([bi, bf]) => i < bf && f > bi);
  });
}

// Corta o que já passou, com a antecedência mínima que ela pediu.
export function sobramHoje(livres, horaAgora, antecedenciaHoras = 0) {
  const corte = emMinutos(horaAgora) + Math.round((Number(antecedenciaHoras) || 0) * 60);
  return livres.filter(h => emMinutos(h) >= corte);
}

export const _teste = { emMinutos, emHora };
