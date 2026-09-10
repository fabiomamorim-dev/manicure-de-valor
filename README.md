# Manicure de Valor

Site institucional e sites das clientes, num repositório só, servidos por um
Worker da Cloudflare que roteia por subdomínio.

```
manicuredevalor.com.br              → public/site/
carlasilva.manicuredevalor.com.br   → public/clientes/carlasilva/
```

## Pastas

```
public/
  site/            institucional (a venda)
  clientes/
    <slug>/
      dados.json   o que muda por cliente — a fonte da verdade
      index.html   gerado pelo script, não editar à mão
template/
  index.html       base dos sites de cliente, com marcadores __DADOS__ e __NOME__
marca/             logo, símbolo e versão monocromática
scripts/
  novo-cliente.mjs gera o index.html a partir do dados.json
worker/
  index.js         roteamento por subdomínio
ferramentas/
  fotos.html       corta e comprime as fotos, roda no navegador
db/
  schema.sql       tabela dos pedidos (lembrete de manutencao)
teste/
  painel.test.mjs  testa o Worker sem subir nada
docs/
  pedir-fotos.md      o que pedir para a profissional, com mensagem pronta
  dados-da-cliente.md o que fica guardado da cliente final, e por quanto tempo
wrangler.toml
```

## Primeira vez

```bash
npm install -g wrangler     # se ainda não tiver
wrangler login
```

No painel da Cloudflare, na zona `manicuredevalor.com.br`, confirme que existe
o registro DNS curinga:

```
Tipo: CNAME   Nome: *   Destino: manicuredevalor.com.br   Proxy: ligado (nuvem laranja)
```

Sem esse registro, os subdomínios não chegam no Worker.

## Rodar local

```bash
npx wrangler dev
```

Abre em `localhost:8787` servindo o institucional. Para testar um cliente:

```bash
curl -H "Host: carlasilva.manicuredevalor.com.br" http://localhost:8787
```

## Publicar

```bash
npx wrangler deploy
```

## Cliente novo

```bash
node scripts/novo-cliente.mjs mariasouza
# cria public/clientes/mariasouza/dados.json com um modelo

# preencha o dados.json e rode de novo:
node scripts/novo-cliente.mjs mariasouza
# gera o index.html

npx wrangler deploy
```

No ar em `mariasouza.manicuredevalor.com.br`.

### Convenção de slug

Nome e sobrenome juntos, minúsculas, sem acento e sem hífen: `carlasilva`.
Em caso de colisão, entra o segundo sobrenome: `carlasilvaramos`.
O script recusa qualquer coisa fora de `[a-z0-9-]`.

### dados.json

| campo | o que faz |
|---|---|
| `profissional` | nome que aparece no topo, no rodapé e na mensagem do WhatsApp |
| `whatsapp` | `55` + DDD + número, sem espaço nem hífen. O script valida o formato |
| `servicos` | alimenta a seção de preços **e** o campo de serviço do agendamento |
| `horarios` | opções do campo de horário |
| `pedirBairro` | `false` esconde o campo e some com a seção "Onde atendo" |
| `bairros` | lista exibida e opções do campo |
| `diasDeAntecedencia` | `0` permite agendar hoje; `1` só a partir de amanhã |
| `diasDeRetorno` | dias até a manutenção, usado no painel. Padrão 21 |
| `tema` | `pop` (padrão), `clean`, `soft`, `minimal` ou `glam`. Ver Temas abaixo |
| `instagram` | usuário sem arroba. Vazio esconde o link do topo |
| `sobre.texto` | seção "Oi, eu sou a ___". Linha em branco separa parágrafo |
| `sobre.foto` | retrato da profissional. Sem foto, a seção fica só com o texto |
| `avaliacoes` | `nota`, `quantidade` e `atendimentos`. Cada um aparece só se preenchido |
| `depoimentos` | lista de `{ texto, autora }`. Lista vazia esconde a seção inteira |

Campo vazio nunca vira placeholder: a seção correspondente simplesmente não é
renderizada. Vale para `sobre`, `avaliacoes`, `depoimentos`, `instagram` e para
cada foto da galeria.

### Avaliações e depoimentos

Não existe número padrão no template, de propósito. Nota, quantidade de
avaliações e contagem de atendimentos só entram no `dados.json` quando a
profissional informar os dela — o mesmo vale para os depoimentos, que ela manda
depois de fechar. O site da Carla Silva (`public/clientes/carlasilva/`) é a
demonstração de venda e tem tudo isso preenchido como exemplo; nenhum cliente
novo nasce com esses dados.

## Temas

Cinco combinações de cor e tipografia, mesma estrutura e mesmo agendamento.
A escolha é da profissional, na hora da venda, e vira uma linha no `dados.json`:

```json
"tema": "clean"
```

| tema | cara | fontes |
|---|---|---|
| `pop` | creme, vermelho-rosa e amarelo, tipografia grossa | Bricolage Grotesque + Instrument Sans |
| `clean` | creme, bordô e dourado, título serifado | DM Serif Display + DM Sans |
| `soft` | rosa claro, nude e marrom | Fraunces + Manrope |
| `minimal` | off-white, marrom e preto, sem cor forte | Instrument Serif + Instrument Sans |
| `glam` | bordô, rosa e dourado | Playfair Display + Manrope |

As cores de cada tema ficam no `template/index.html`, em
`html[data-tema="..."]` — só variáveis CSS, nenhuma regra duplicada. As fontes
ficam em `TEMAS`, no `scripts/novo-cliente.mjs`, e o script injeta na geração
só as do tema escolhido, para o site não baixar fonte que não usa.

Tema errado ou inventado no `dados.json` para a geração e lista os que existem.

### Contraste

As cores foram escolhidas para passar no AA da WCAG nos pares que importam:
texto sobre fundo, texto secundário sobre fundo, branco sobre o botão e o preço
sobre a seção escura. Ao criar um tema novo, confira esses quatro pares antes —
boa parte do público tem mais de 40 anos e lê no celular, no sol.

## Lembrete de manutenção

A cliente de manicure volta a cada duas ou três semanas — quando lembra. Quem
lembra por ela é a profissional, e é isso que o painel resolve.

Como funciona: ao enviar o agendamento, o site registra o pedido no Worker
**e** abre o WhatsApp, como sempre. Depois, em `/painel`, a profissional vê
quem está na hora de voltar e chama com um toque — a mensagem já vai escrita.
Quem manda é ela, do número dela. Não existe API do WhatsApp no meio, nem
mensagem saindo em nome de ninguém.

Enquanto o banco não estiver ligado, nada disso atrapalha: o site funciona
igual, o agendamento abre o WhatsApp e o registro simplesmente não acontece.

### Ligar o banco

```bash
npx wrangler d1 create manicure-de-valor
# cole o database_id no wrangler.toml e descomente o bloco [[d1_databases]]

npx wrangler d1 execute manicure-de-valor --remote --file=db/schema.sql
npx wrangler secret put PAINEL_SEGREDO   # invente uma frase longa e guarde
npx wrangler deploy
```

### Link de uma profissional

```bash
PAINEL_SEGREDO="a mesma frase" node scripts/link-painel.mjs carlasilva
```

Sai o link com a assinatura dela. Esse link é a senha: mande pela conversa
dela e peça para salvar na tela de início do celular. Trocar o
`PAINEL_SEGREDO` invalida todos os links de uma vez.

### O que ela vê

**Chamar agora** (passou do `diasDeRetorno`), **Vence essa semana** e
**Pedidos novos** (chegaram pelo site e ela ainda não confirmou). Cada cartão
tem "Chamar no WhatsApp", "Atendi de novo" — que zera a contagem — e
"Arquivar".

Dados da cliente final têm regra própria: [`docs/dados-da-cliente.md`](docs/dados-da-cliente.md).

### Teste

```bash
node teste/painel.test.mjs
```

Sobe um banco de mentira em memória e exercita o Worker inteiro: gravação do
pedido, link certo, link errado, link de outra profissional, contagem dos dias,
mensagem montada e os arquivos do site continuando a ser servidos. Precisa de
node 22.5 ou mais novo.

## Publicar

Push na `main` publica sozinho: o GitHub Actions regenera o site de todas as
clientes a partir do template, roda os testes e só então faz o deploy. Se um
teste falhar, nada vai ao ar. Dá para disparar na mão também, pelo botão
"Run workflow" na aba Actions — útil para republicar sem commit.

Isso é o que garante que mexer no `template/index.html` alcança quem já está
no ar: sem a regeneração no deploy, uma cliente vendida em março continuaria
com o HTML daquele mês.

O workflow está em `.github/workflows/deploy.yml` e precisa de dois secrets no
repositório (Settings → Secrets and variables → Actions):

| secret | onde pegar |
|---|---|
| `CLOUDFLARE_API_TOKEN` | painel da Cloudflare → API Tokens → template "Edit Cloudflare Workers", mais D1:Edit e Zone DNS:Edit, limitado à zona manicuredevalor.com.br |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami`, ou a coluna da direita na página de Workers |

O `PAINEL_SEGREDO` não entra aqui: ele é secret do Worker
(`npx wrangler secret put`), não do GitHub, e o deploy não mexe nele.

Para publicar do seu computador, sem Actions:

```bash
npx wrangler login   # só na primeira vez
npx wrangler deploy
```

## Fotos

O site usa oito: capa, seis trabalhos e o retrato da profissional. O que pedir
para ela e como pedir está em [`docs/pedir-fotos.md`](docs/pedir-fotos.md),
com mensagem pronta para mandar no WhatsApp.

Com as fotos em mãos:

1. Abra `ferramentas/fotos.html` no navegador (arquivo local, não precisa de
   servidor). Arraste as fotos, escolha a posição de cada uma, ajuste o
   enquadramento e baixe o zip.
2. Descompacte em `public/clientes/<slug>/fotos/`.
3. `node scripts/novo-cliente.mjs <slug>`.

A ferramenta corta no formato de cada posição, reduz e salva em WebP, tudo no
navegador — nenhuma foto sai da máquina. Os arquivos saem nomeados pela
convenção que o script procura:

```
fotos/capa.webp    topo, 16:10, 1400px
fotos/01.webp      trabalho grande da galeria, quadrado, 900px
fotos/02..05.webp  trabalhos menores, quadrados, 700px
fotos/06.webp      faixa deitada, 2:1, 1400px
fotos/sobre.webp   retrato, 4:5, 800px
```

Quando essa pasta existe, ela manda mais que o `dados.json` — o script usa os
arquivos e nem toca nos campos de foto. O `dados.json` do cliente pode continuar
com `fotos.capa` vazio. URL externa (como as do banco de imagem no site de
demonstração da Carla) só é usada quando não há pasta `fotos/`.

## O que não está aqui, e por quê

**Supabase.** Nada no site precisa de banco ainda. Entra quando existir painel
para a cliente trocar as próprias fotos, ou quando o agendamento virar reserva
de verdade em vez de mensagem.

**Resend.** Mesma coisa. O agendamento hoje abre o WhatsApp direto, sem
servidor no meio. Se um dia você quiser cópia dos pedidos por e-mail, o ponto
de entrada é uma rota no Worker.

**Agenda real.** O formulário monta um pedido, não uma reserva — não checa
disponibilidade. Isso é proposital nesta fase e está respondido no FAQ do
institucional.
