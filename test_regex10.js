const cases = 'Внедрено 48 роботов на складах ГК «Восток-Сервис» для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

// The issue: "груз" matches in "транспортировки" which comes first!
console.log('Index of "груз" in "транспортировки":', cases.indexOf('груз'));
console.log('Index of "отгрузок":', cases.indexOf('отгрузок'));

// The regex finds the first match of the alternation
console.log('\nTest with reordered alternation (отгруз first):');
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*(?:отгруз|операци|посад|груз|ед|короб|посыл|заказ|пallet|паллет)\s*(?:за|в)\s*смен/i));

// The fix: put longer/more specific patterns first in alternation
console.log('\nReordered (отгрузок before груз):');
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*(?:отгруз|отгрузок|операци|посад|посыл|заказ|короб|ед|пallet|паллет|груз)\s*(?:за|v)\s*смен/i));