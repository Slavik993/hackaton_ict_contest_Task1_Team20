const cases = 'Внедрено 48 роботов на складах ГК Восток-Сервис для транспортировки грузов между зонами хранения. В результате производительность выросла вдвое - с 4 до 8 тысяч отгрузок за смену, количество ошибок сократилось в 13 раз.';

console.log('Test 1:', cases.match(/8\sтыс/i));
console.log('Test 2:', cases.match(/8\s+тыс/i));
console.log('Test 3:', cases.match(/8\s*тыс/i));
console.log('Test 4:', cases.match(/\d+\s*тыс/i));
console.log('Test 5:', cases.match(/\d\s*тыс/i));
console.log('Test 6:', cases.match(/8\s/));
console.log('Test 7:', ' '.match(/\s/));
console.log('Test 8:', cases.match(/\s/));