# Pedir as fotos

A unha é o produto. Site de manicure sem foto boa é cardápio sem foto de comida
— e é a parte que não dá pra resolver no código.

## O que pedir

Oito fotos, sempre as mesmas oito:

| Quantas | O quê | Formato |
|---|---|---|
| 6 | trabalhos variados — nude, francesinha, cor forte, alongamento, gel, nail art | quadrada |
| 1 | a melhor delas, para o topo do site | celular deitado |
| 1 | retrato da profissional, do peito para cima | celular em pé |

Variar o estilo importa mais do que ter seis fotos perfeitas do mesmo tom: a
galeria é o que responde "ela faz o que eu quero?" antes de a cliente perguntar.

## Qualidade

- **Luz do dia, perto da janela.** Sem flash — flash em unha com brilho estoura
  o reflexo e some com a cor.
- **Fundo limpo.** Mesa lisa, toalha lisa. Bagunça atrás derruba a percepção de
  profissional mais rápido que qualquer detalhe do site.
- **Mandar como documento/arquivo no WhatsApp**, não como foto. Foto normal o
  WhatsApp comprime e chega ruim demais para usar grande.
- Foto pequena o site aceita, mas fica borrada nas posições grandes. A
  ferramenta avisa quando a imagem não tem largura suficiente.

## Autorização

Se aparece a mão de uma cliente, a foto é de outra pessoa. Vale pedir para a
profissional confirmar com a cliente antes — mesma regra dos depoimentos com
nome. É rápido, evita dor de cabeça e ainda passa uma imagem melhor da
profissional para a própria cliente.

## Mensagem pronta

> Oi, [nome]! Pra montar seu site preciso de algumas fotos suas. São 8 no total:
>
> • 6 de trabalhos que você tem orgulho, variando o estilo — uma nude, uma
> francesinha, uma cor forte, um alongamento, uma nail art. Assim a cliente vê
> na hora que você faz de tudo.
> • 1 foto de destaque, tirada com o celular deitado. Essa vai no topo do site.
> • 1 foto sua, em pé, do peito pra cima. Pode ser simples — é a que faz a
> cliente confiar em receber você em casa.
>
> Duas coisas ajudam muito: luz do dia perto da janela, sem flash, e fundo
> limpo, sem nada bagunçado atrás.
>
> Manda aqui como *documento* (aquele clipe → documento) em vez de foto normal,
> senão o WhatsApp comprime e chega sem qualidade.
>
> Ah: se aparecer a mão de alguma cliente, confirma com ela se pode usar, tá?

## Depois que o site está no ar

Depoimento só entra depois que a cliente fecha e atende com o site — nada de
depoimento inventado. Quando ela tiver os primeiros:

> Oi, [nome]! Quer colocar depoimento de cliente no seu site? Me manda 2 ou 3
> mensagens que suas clientes te mandaram elogiando o trabalho — pode ser print
> mesmo. Só preciso que você confirme com elas se pode publicar, e me diga como
> quer que apareça o nome (normalmente é primeiro nome + inicial do sobrenome,
> tipo "Marina S.").

O mesmo vale para nota e quantidade de atendimentos: só entram no `dados.json`
com número que a profissional realmente tem.

## E depois

1. Salve as fotos numa pasta qualquer do computador.
2. Abra `ferramentas/fotos.html` no navegador, arraste tudo, ajuste o
   enquadramento e baixe o zip.
3. Descompacte em `public/clientes/<slug>/fotos/`.
4. `node scripts/novo-cliente.mjs <slug>` — o script acha as fotos sozinho.
5. `npx wrangler deploy`.
