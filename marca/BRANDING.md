# Manicure de Valor — guia da marca

Para usar com o Claude na hora de criar post, story ou qualquer arte.
Anexe este arquivo na conversa, ou cole o conteúdo, e peça o que precisa.

---

## O que é

Sites prontos para manicure autônoma, por R$ 39,90 por mês (ou R$ 99 por três
meses). A profissional manda fotos e preços pelo WhatsApp, e em um dia tem um
site com o nome dela, agendamento que cai no WhatsApp dela e perfil no Google.

É uma marca da Revene. Endereço: manicuredevalor.com.br

## Com quem a gente fala

Manicure autônoma, de três jeitos — e o benefício muda em cada um:

| Ela trabalha | O que o site resolve |
|---|---|
| Vai até a casa da cliente | Ser achada por quem ainda não a conhece. Hoje depende de indicação |
| Tem o próprio espaço | Aparecer no mapa para quem busca "manicure perto de mim" |
| Atende no salão de outra pessoa | A clientela passa a ser dela, e vai junto se mudar de salão |

Nunca prometa perfil no Google para quem está em salão de outra pessoa: o
endereço já tem o perfil do salão, e o Google não aceita dois no mesmo ponto.

---

## Cores

| Cor | Código | Onde usa |
|---|---|---|
| Marrom | `#412e2a` | Fundo escuro e texto sobre claro |
| Creme | `#fdf7f4` | Fundo claro |
| Creme claro | `#fbf1ec` | Texto sobre o marrom |
| Nude | `#e8b4a0` | Destaque sobre fundo escuro: números, palavra realçada |
| Rosa | `#c05267` | Botões, links, destaque sobre fundo claro |
| Cinza quente | `#846d66` | Texto secundário sobre claro |
| Cinza no escuro | `#a89894` | Texto secundário sobre marrom |

O nude é para fundo escuro e o rosa para fundo claro. Nude sobre creme
praticamente some — foi testado e não funciona.

---

## Tipografia

**Fraunces** nos títulos, peso 600. Entrelinha curta (perto de 1.05) e espaço
entre letras levemente negativo.

**Manrope** no texto corrido, peso 400. Peso 500 em rótulo e botão.

As duas são gratuitas no Google Fonts. Em ferramenta que não tenha Fraunces,
use outra serifa de contraste baixo. Nunca Playfair Display, que puxa a marca
para um ar de consultoria.

---

## O símbolo

Um V que também é unha: a divisão curva no meio é a linha do sorriso da
francesinha. Cantos arredondados, nunca em bico.

**Fundo escuro** — a versão principal:

```svg
<svg viewBox="0 0 160 172" xmlns="http://www.w3.org/2000/svg">
  <mask id="v"><path d="M20 26h30l30 80 30-80h30L80 152z" fill="#fff"
    stroke="#fff" stroke-width="24" stroke-linejoin="round"/></mask>
  <g mask="url(#v)">
    <rect width="160" height="172" fill="#fbf1ec"/>
    <path d="M0 62q80 26 160 0v110H0z" fill="#e8b4a0"/>
  </g>
</svg>
```

**Fundo claro** — troque os dois preenchimentos por `#412e2a` (parte de cima)
e `#c05267` (parte de baixo). Não use o nude aqui: em tamanho pequeno ele
desaparece contra o creme e o símbolo vira uma mancha.

**Uma cor só**, para carimbo, bordado ou impressão simples — o sorriso vira um
vão:

```svg
<g mask="url(#v)">
  <rect width="160" height="172" fill="#412e2a"/>
  <path d="M0 60q80 26 160 0v13q-80 26-160 0z" fill="#fdf7f4"/>
</g>
```

Ao lado do símbolo vem o nome em duas linhas, Fraunces 600: "manicure" na cor
do texto e "de valor" na cor de destaque. Tudo em caixa baixa.

Os arquivos prontos vêm junto com este guia. São três peças, cada uma em
versão para fundo claro (`-creme`) e fundo escuro (`-marrom`):

| Arquivo | O que é | Quando usa |
|---|---|---|
| `logo-fundo-creme` / `logo-fundo-marrom` | Símbolo + nome, já com o fundo | Capa, cabeçalho de arte, assinatura no pé |
| `logo-transparente` | Símbolo + nome, sem fundo | Por cima de foto ou de um fundo que você escolheu |
| `simbolo-creme` / `simbolo-marrom` | Só o símbolo | Marca d'água, selo, canto de arte |
| `perfil-creme` / `perfil-marrom` | Símbolo centrado em quadrado | Foto de perfil de Instagram e WhatsApp |

Cada um tem `.svg` (não perde qualidade, bom para editor de design) e `.png`
(funciona em qualquer lugar). Use o PNG se tiver dúvida.

---

## Como a marca escreve

Frases curtas. Segunda pessoa — "você", nunca "o cliente". Sentence case em
tudo, inclusive títulos e botões: nunca Title Case, nunca CAIXA ALTA.

O preço aparece sempre que fizer sentido. Esconder preço é o que a concorrência
faz, e o nosso argumento é justamente o contrário.

**Palavras que não usamos:** simplesmente, basta, incrível, inovador,
revolucionário, "o melhor", "a solução ideal". Nada de ponto de exclamação em
texto de sistema.

**O jeito certo:**

| Em vez de | Escreva |
|---|---|
| "Simplesmente preencha o formulário!" | "Preenche aqui e envia." |
| "Nossa solução completa para manicures" | "Um site com o seu nome." |
| "Entre em contato conosco" | "Me chama no WhatsApp." |
| "Agende Seu Horário" | "Agendar horário" |

Nunca prometa o que não entregamos. Se alguma coisa não vale para um dos três
perfis, ou se diz para quem vale, ou se deixa de fora.

---

## Formatos

| Peça | Medida | Cuidado |
|---|---|---|
| Story e status | 1080 × 1920 | Deixe perto de 210px livres em cima e 290px embaixo: a barra de progresso e a caixa "Responder" cobrem esses pedaços |
| Post de feed | 1080 × 1080 | |
| Catálogo do WhatsApp | 1080 × 1080 | |
| Imagem para mandar junto com o link | 1080 × 1080 | Precisa explicar sozinha, sem o link ser clicado |
| Foto de perfil | 1080 × 1080 | Só o símbolo, nunca a logo com o nome — o texto some quando vira bolinha |

---

## O que já existe

Na pasta `marca/whatsapp/`:

- `cat-mensal.png` e `cat-trimestral.png` — os dois planos, para o catálogo
- `st-abertura.png`, `st-funciona.png`, `st-preco.png`, `st-chamada.png` — status
- `indica.png` — para conhecido mandar junto com o link

Todas foram feitas a partir de arquivos HTML que estão na mesma pasta. Para
mudar um preço ou um texto, é mais rápido editar o HTML do que refazer a arte.

---

## Pedindo uma arte ao Claude

Diga o formato, o assunto e para qual dos três perfis é. Exemplo:

> Com o guia da marca em anexo, faça um story 1080x1920 para manicure que
> atende no salão de outra pessoa. A ideia é: as clientes passam a ser dela e
> vão junto se ela mudar de lugar. Fundo marrom, destaque em nude.

Dois pedidos que costumam vir e a resposta certa:

**"Faça um post falando que aparece no Google"** — só vale para quem vai até a
cliente ou tem espaço próprio. Para salão de terceiro, o assunto é outro.

**"Coloque uma foto de unha"** — use foto real de cliente, com autorização.
Foto de banco de imagem no material de venda tudo bem; no site de uma
profissional, não — ela vende o próprio trabalho e a cliente compara.

---

## Links

- Site: https://manicuredevalor.com.br
- Exemplo de site de cliente: https://carlasilva.manicuredevalor.com.br
- Instagram: @soumanicuredevalor
- WhatsApp: (41) 93500-0852
- E-mail: contato@manicuredevalor.com.br

Sempre mande o link com `https://` na frente. Sem isso o WhatsApp deixa o
endereço azul e abre normalmente, mas não gera o card com imagem.
