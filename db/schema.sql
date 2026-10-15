-- Agenda da profissional. Duas tabelas: quem é a cliente, e cada vez que ela
-- foi atendida ou pediu para ser.
--
-- A separação existe porque o painel precisa responder "quem é a Marina e o
-- que ela já fez comigo", e não só "que pedidos chegaram". Com tudo numa
-- tabela só, o nome e o telefone se repetem a cada visita e não existe
-- histórico de ninguém.
--
--   npx wrangler d1 execute manicure-de-valor --remote --file=db/schema.sql

-- A tabela antiga, de quando isso era só um registro de pedidos do site.
-- Nunca chegou a ter dado real: foi criada e substituída no mesmo dia.
DROP TABLE IF EXISTS pedidos;

-- Quem abre o painel. O link privado de cada profissional é o token daqui:
--
--   https://<slug>.manicuredevalor.com.br/painel?k=<token>
--
-- Antes isso era um HMAC de um segredo único do Worker, e tinha dois
-- problemas: alguém precisava guardar a frase para sempre, e trocá-la um dia
-- derrubaria o link de todas as profissionais de uma vez. Com um token por
-- pessoa, revogar o de uma é apagar uma linha.
CREATE TABLE IF NOT EXISTS profissionais (
  slug        TEXT NOT NULL PRIMARY KEY,
  token       TEXT NOT NULL,
  pin_hash    TEXT,                       -- vazio = ela ainda não criou o PIN
  pin_salt    TEXT,
  erros       INTEGER NOT NULL DEFAULT 0, -- tentativas erradas seguidas
  travado_ate TEXT,                       -- depois de cinco erros, espera
  criado_em   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS profissionais_por_token ON profissionais (token);

-- O link sozinho não abre a agenda. Na primeira vez em cada aparelho ela
-- digita um PIN de quatro números; dando certo, o aparelho entra aqui e não
-- pergunta mais. É o que impede que o link, que fica para sempre na conversa
-- de WhatsApp dela, seja suficiente para alguém entrar.
--
-- Perdeu o celular: apagar as linhas do slug dela derruba todos os aparelhos.
CREATE TABLE IF NOT EXISTS dispositivos (
  token      TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL,
  criado_em  TEXT NOT NULL,
  ultimo_em  TEXT
);

CREATE INDEX IF NOT EXISTS dispositivos_por_slug ON dispositivos (slug);

CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL,            -- de qual profissional é essa cliente
  nome       TEXT    NOT NULL,
  fone       TEXT    NOT NULL,            -- só dígitos, com DDI: 5541999998888
  obs        TEXT,                        -- anotação dela: alergia, preferência, o que for
  criado_em  TEXT    NOT NULL
);

-- É isso que faz o painel reconhecer quem já é cliente quando ela digita o
-- telefone. Por isso o fone é guardado normalizado: "(41) 99999-8888" e
-- "41999998888" têm que cair na mesma pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_por_fone ON clientes (slug, fone);

CREATE TABLE IF NOT EXISTS atendimentos (
  id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  servico     TEXT    NOT NULL,
  duracao     INTEGER NOT NULL DEFAULT 60,  -- minutos. Sem isso não dá para saber
                                            -- que um "manicure + pedicure" de duas
                                            -- horas ocupa dois horários, não um.
  data        TEXT    NOT NULL,             -- AAAA-MM-DD
  hora        TEXT,                         -- HH:MM
  bairro      TEXT,
  onde        TEXT,                         -- 'vou' | 'recebo' | vazio
  status      TEXT    NOT NULL DEFAULT 'pedido',
  retorno     INTEGER NOT NULL DEFAULT 21,  -- dias até a manutenção
  avisada_em  TEXT,                         -- última vez que ela chamou pelo painel
  origem      TEXT    NOT NULL DEFAULT 'site',  -- 'site' | 'painel'
  criado_em   TEXT    NOT NULL
);

-- Os quatro estados, e o que cada um significa para a agenda:
--
--   pedido      chegou pelo site, ela ainda não confirmou   ocupa o horário
--   confirmado  ela confirmou                               ocupa o horário
--   atendido    aconteceu                                   começa a contar o retorno
--   cancelado   não vai acontecer                           libera o horário, fica no histórico
--
-- "pedido" ocupa de propósito: se não ocupasse, duas clientes pediriam o mesmo
-- sábado às 14h antes de ela abrir o painel, e sobraria para ela desmarcar.

-- Para montar o dia e para saber o que está livre.
CREATE INDEX IF NOT EXISTS atendimentos_por_dia
  ON atendimentos (slug, data, status);

-- Para montar o histórico de uma cliente.
CREATE INDEX IF NOT EXISTS atendimentos_por_cliente
  ON atendimentos (cliente_id, data);

-- Limpeza: telefone de cliente não fica guardado para sempre. O Worker faz
-- sozinho todo dia de madrugada (ver [triggers] no wrangler.toml e a função
-- scheduled em worker/index.js):
--
--   um ano sem atendimento   →  nome e telefone da cliente saem
--   dois anos                →  o atendimento sai do banco
--   cliente sem atendimento  →  sai junto
--
-- O atendimento anônimo fica no meio porque ainda serve para entender demanda:
-- serviço, dia da semana, horário e bairro, sem ninguém identificado.
