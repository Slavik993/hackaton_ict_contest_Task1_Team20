const cases = 'Внедрено 48 роботов на складах ГК «Восток-Сервис» для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

// Simplify step by step
console.log('Step 1:', cases.match(/\d+\s*тысяч\s*отгруз/i));
console.log('Step 2:', cases.match(/\d+\s*тысяч\s*отгрузок/i));
console.log('Step 3:', cases.match(/\d+\s*тысяч\s*отгрузок\s*за/i));
console.log('Step 4:', cases.match(/\d+\s*тысяч\s*отгрузок\s*за\s*смен/i));
console.log('Step 5:', cases.match(/\d+\s*тысяч\s*отгрузок\s*за\s*смену/i));

// Try with the alternation
console.log('\nWith alternation:');
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*отгруз/i));
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*отгрузок/i));
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*отгрузок\s*за/i));
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*отгрузок\s*за\s*смен/i));
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*отгрузок\s*за\s*смену/i));

// Try the full alternation
console.log('\nFull alternation:');
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*(?:отгруз|операци|посад|груз|ед|короб|посыл|заказ|пallet|паллет)\s*(?:за|в)\s*смен/i));
console.log(cases.match(/\d+\s*(?:тыс|тысяч)\s*(?:отгруз|операци|посад|груз|ед|короб|посыл|заказ|пallet|паллет)\s*(?:за|в)\s*смену/i));