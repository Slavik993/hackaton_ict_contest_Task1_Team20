const cases = 'Внедрено 48 роботов на складах ГК «Восток-Сервис» для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

// The issue: \d+\s*(?:тыс|тысяч)? matches "48 " because it's the first number
// Fix: make it require the throughput keywords after the number

console.log('Fixed pattern:');
const fixed = cases.match(/(\d+\s*(?:тыс|тысяч))\s*(?:отгруз|операци|посад|груз|ед|короб|посыл|заказ|пallet|паллет)\s*(?:за|в)\s*смен/i);
console.log(fixed);

if (fixed) {
  let n = fixed[1].replace(/\s/g, '').replace(/\u00A0/g, '');
  n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000');
  console.log('Parsed:', parseFloat(n));
}