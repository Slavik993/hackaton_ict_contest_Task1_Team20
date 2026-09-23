const cases = 'Внедрено 48 роботов на складах ГК «Восток-Сервис» для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

// Test step by step
console.log('Test 1 - basic:', cases.match(/8\s*тыс/i));
console.log('Test 2 - with thousands:', cases.match(/8\s*тысяч/i));
console.log('Test 3 - full pattern part 1:', cases.match(/(\d+\s*(?:тыс|тысяч|т\.?\s*ы\.?\s*с)?)/i));
console.log('Test 4 - отгруз:', cases.match(/отгруз/i));
console.log('Test 5 - за смен:', cases.match(/за\s*смен/i));
console.log('Test 6 - combined:', cases.match(/8\s*тысяч\s*отгрузок\s*за\s*смен/i));

// Check the exact substring
const idx = cases.indexOf('8 тысяч');
console.log('\nSubstring from index:', cases.substring(idx, idx+30));
console.log('Char codes:', [...cases.substring(idx, idx+30)].map(c => c.charCodeAt(0)));