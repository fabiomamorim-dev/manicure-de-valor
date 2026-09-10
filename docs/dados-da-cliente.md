# Dados da cliente final

A partir do lembrete de manutenção, o produto guarda dado de pessoa que não é
sua cliente: é cliente da sua cliente. Vale tratar com cuidado desde o começo,
porque desfazer depois é caro.

## O que fica guardado

Por agendamento feito pelo site: nome, telefone, serviço escolhido, data, hora
e bairro. Mais o estado (pedido, atendida, arquivada) e a data da última vez
que a profissional chamou pelo painel.

Não guardamos, e não é para começar a guardar sem uma boa razão: e-mail,
endereço completo, CPF, forma de pagamento, foto.

## Para que serve

Uma coisa só: a profissional lembrar de chamar a cliente para a manutenção. É
isso que está escrito no formulário, acima do botão de enviar:

> Seus dados vão só para [nome da profissional], para confirmar o horário e
> lembrar da sua manutenção.

Enquanto o uso for esse, a frase é verdadeira. Se um dia o dado for usado para
outra coisa — disparo em massa, promoção, venda de lista — a frase vira mentira
e o problema deixa de ser técnico.

## De quem é o dado

Da profissional. Ela é quem tem a relação com a cliente; a Manicure de Valor só
hospeda. Na prática isso significa:

- Se ela sair do produto, os dados dela saem junto. Devolva em CSV e apague.
- Se uma cliente pedir para ser esquecida, a profissional avisa e a linha sai.
  `DELETE FROM pedidos WHERE id = ?` — vale a pena virar um botão no painel
  quando alguém pedir pela primeira vez.
- Ninguém além dela vê o painel dela: o link é assinado por profissional.

## Prazo

Telefone de cliente não fica guardado para sempre. O `db/schema.sql` traz a
limpeza pronta:

```sql
DELETE FROM pedidos WHERE julianday('now') - julianday(criado_em) > 365;
```

Um ano cobre com folga o ciclo de manutenção, que é de semanas. Rode de tempos
em tempos, ou deixe agendado num Cron Trigger do Worker quando o volume pedir.

## O link do painel é a senha

Quem tem o link abre o painel. Não tem login, e isso é proposital: a
profissional não vai criar conta nem lembrar de senha, e um login mal feito é
pior que um link secreto bem feito.

O que isso exige:

- O link é assinado com `PAINEL_SEGREDO`, que fica só no Worker. Sem o segredo
  não dá para adivinhar o link de ninguém.
- O painel pede para o Google não indexar (`noindex`), mas o que protege de
  verdade é o segredo, não a meta tag.
- Se um link vazar, troque o `PAINEL_SEGREDO` — todos os links mudam de uma vez
  e você gera os novos com `scripts/link-painel.mjs`.
- Oriente a profissional a salvar o link na tela de início e não mandar em
  grupo.
