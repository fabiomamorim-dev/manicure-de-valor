// Os efeitos sonoros e o instante de cada um, na linha do tempo da locução
// completa. Fica num arquivo só porque tanto a mixagem inteira quanto o corte
// curto leem daqui — se o tempo mudar, muda nos dois.
//
//   [ som, segundo, volume ]

export const EFEITOS = [
  // cena 1 · as sete mensagens caindo, uma a uma, perdendo força para não
  // cansar o ouvido — a ideia é acúmulo, não alarme
  ["mensagem", 0.55, 0.42], ["mensagem", 0.97, 0.39], ["mensagem", 1.39, 0.36],
  ["mensagem", 1.81, 0.33], ["mensagem", 2.23, 0.30], ["mensagem", 2.65, 0.28],
  ["mensagem", 3.07, 0.26],

  // cena 2 · as perguntas entrando por cima
  ["swish", 4.70, 0.30], ["swish", 6.25, 0.30], ["swish", 7.35, 0.30],

  // cena 3 · a virada para o caderninho e o carimbo dos dois meses
  ["whoosh", 14.62, 0.34],
  ["toque", 19.18, 0.50],

  // cena 4 · a virada para o produto e o marcador na palavra
  ["whoosh", 20.32, 0.34],
  ["swish", 22.66, 0.26],

  // cena 5 · o celular entra, rola até os preços, e ela toca nos passos
  ["whoosh", 23.46, 0.30],
  ["swish", 25.42, 0.24],
  ["toque", 27.92, 0.42], ["toque", 29.20, 0.42],

  // cena 6 · o pedido chegando e caindo no painel
  ["mensagem", 32.30, 0.42],
  ["whoosh", 33.40, 0.28], ["toque", 33.66, 0.34],

  // cena 7 · a rolagem pelo painel e a troca para as clientes
  ["swish", 34.60, 0.22], ["swish", 36.95, 0.22],
  ["whoosh", 39.10, 0.28], ["toque", 41.30, 0.38],

  // cena 8 · o lembrete, a mensagem pronta e o envio
  ["whoosh", 42.56, 0.28],
  ["lembrete", 44.46, 0.40],
  ["swish", 45.60, 0.22],
  ["toque", 48.20, 0.44], ["enviado", 48.56, 0.40],

  // cena 9 · a marca
  ["swish", 50.28, 0.24], ["toque", 52.16, 0.34],
];
