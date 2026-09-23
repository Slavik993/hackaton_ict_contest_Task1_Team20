const cases = 'Внедрено 48 роботов на складах ГК «Восток-Сервис» для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

// The issue is likely the word boundary with Cyrillic
// \b doesn't work well with non-ASCII
console.log('Test 1:', cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смен/i));
console.log('Test 2:', cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смену/i));
console.log('Test 3:', cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смен\b/i));
console.log('Test 4:', cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смену\b/i));

// Try without \s* around за/в
console.log('\nTest without \s*:');
console.log(cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смен/i));

// The full pattern:
console.log('\nFull pattern with смену:');
console.log(cases.match(/(\d+\s*(?:тыс|тысяч))\s*(?:отгруз|операци|посад|груз|ед|короб|посыл|заказ|пallet|паллет)\s*(?:за|в)\s*смену/i));