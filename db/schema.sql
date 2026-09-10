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

-- Limpeza: nada de guardar telefone de cliente para sempre. Rode de tempos em
-- tempos (ou deixe agendado) para apagar o que passou de um ano.
--
--   DELETE FROM pedidos WHERE julianday('now') - julianday(criado_em) > 365;
