-- Banco dos pedidos. Um registro por agendamento feito pelo site.
-- Guarda o mínimo para o lembrete de manutenção funcionar: quem, como falar
-- com ela, o que foi feito e quando.
--
--   npx wrangler d1 execute manicure-de-valor --remote --file=db/schema.sql

CREATE TABLE IF NOT EXISTS pedidos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL,              -- de qual profissional é o pedido
  nome        TEXT    NOT NULL,
  fone        TEXT    NOT NULL,
  servico     TEXT    NOT NULL,
  data        TEXT    NOT NULL,              -- data pedida, AAAA-MM-DD
  hora        TEXT,
  bairro      TEXT,
  retorno     INTEGER NOT NULL DEFAULT 21,   -- dias até a manutenção
  status      TEXT    NOT NULL DEFAULT 'pedido',  -- pedido | atendida | arquivada
  atendida_em TEXT,                          -- data do atendimento confirmado
  avisada_em  TEXT,                          -- última vez que ela chamou pelo painel
  criado_em   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS pedidos_por_slug ON pedidos (slug, status);

-- Limpeza: nada de guardar telefone de cliente para sempre. Nao precisa rodar
-- na mao — o Worker faz isso sozinho todo dia de madrugada (ver [triggers] no
-- wrangler.toml e a funcao scheduled em worker/index.js):
--
--   um ano depois do atendimento  →  nome e fone saem, status vira arquivada
--   dois anos depois              →  a linha sai do banco
--
-- A linha anonima fica no meio porque ainda serve para entender demanda:
-- servico, dia da semana, horario e bairro, sem ninguem identificado.
