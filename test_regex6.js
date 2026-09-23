const cases = 'Внедрено 48 роботов на складах ГК «Восток-Сервис» для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

console.log('Test "за смен":', cases.match(/за\s*смен/i));
console.log('Test "за смену":', cases.match(/за\s*смену/i));

// The issue might be the \s* - let's check
console.log('\nWith exact space:');
console.log('Test:', cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смену/i));

// Or maybe the word boundary issue
console.log('\nFull pattern test:');
const test4 = cases.match(/(\d+\s*(?:тыс|тысяч))\s*(?:отгруз|операци|посад|груз|ед|короб|посыл|заказ|пallet|паллет)\s*(?:за|в)\s*смену/i);
console.log(test4);