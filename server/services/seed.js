const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { parseCatalogCsv, parseDatasets } = require('./catalog-parser');
const xlsx = require('xlsx');

const CATALOG_CSV = path.join(__dirname, '..', '..', 'catalog_export_v4.csv');
const DATASETS_XLSX = path.join(__dirname, '..', '..', 'Датасеты_хакатон.xlsx');

async function seed() {
  console.log('Starting database seed...');
  const db = getDb();

  db.exec('BEGIN');

  const industries = [
    { id: 'trade', name: 'Торговля', shortName: 'Торговля', description: 'Склады, распределительные центры и торговые объекты', accent: '#4f7cff' },
    { id: 'logistics', name: 'Логистика', shortName: 'Логистика', description: 'Транспортные узлы, терминалы и аэропорты', accent: '#00a8a3' },
    { id: 'social', name: 'Социальная сфера', shortName: 'Социальная сфера', description: 'Медицинские организации и учреждения с людьми', accent: '#8b5cf6' },
    { id: 'industry', name: 'Промышленность', shortName: 'Промышленность', description: 'Производственные предприятия и заводы', accent: '#f59e0b' },
    { id: 'agriculture', name: 'Сельское хозяйство', shortName: 'Сельхоз', description: 'Сельскохозяйственные предприятия', accent: '#10b981' },
    { id: 'other', name: 'Другое', shortName: 'Другое', description: 'Произвольный объект и параметры организации', accent: '#f59e0b' },
  ];

  const insertIndustry = db.prepare(`
    INSERT OR REPLACE INTO industries (id, name, short_name, description, accent)
    VALUES (@id, @name, @shortName, @description, @accent)
  `);
  industries.forEach(ind => insertIndustry.run(ind));

  const objectTypes = [
    { id: 'warehouse', industry_id: 'trade', name: 'Склад', shortName: 'Склад', description: 'Приёмка, хранение, комплектация и отгрузка', icon: '▣', defaults: JSON.stringify({ area: 20000, operations: 100000, staff: 180, salary: 100000, shifts: 2, workingDays: 365, electricity: 12, avgWeight: 800 }) },
    { id: 'retail', industry_id: 'trade', name: 'Торговый зал', shortName: 'Торг. зал', description: 'Пополнение полок и перемещение товаров', icon: '▤', defaults: JSON.stringify({ area: 1800, operations: 3200, staff: 24, salary: 68000, shifts: 2, workingDays: 300, electricity: 7.8, avgWeight: 5 }) },
    { id: 'airport', industry_id: 'logistics', name: 'Аэропорт', shortName: 'Аэропорт', description: 'Багаж, груз и сервисные маршруты терминала', icon: '✈', defaults: JSON.stringify({ area: 85000, operations: 1000000, staff: 500, salary: 100000, shifts: 3, workingDays: 365, electricity: 25, avgWeight: 18 }) },
    { id: 'terminal', industry_id: 'logistics', name: 'Логистический терминал', shortName: 'Терминал', description: 'Кросс-докинг и обработка грузопотоков', icon: '⇄', defaults: JSON.stringify({ area: 12000, operations: 500000, staff: 120, salary: 88000, shifts: 3, workingDays: 365, electricity: 18, avgWeight: 22 }) },
    { id: 'medical', industry_id: 'social', name: 'Медучреждение', shortName: 'Медучреждение', description: 'Доставка материалов, дезинфекция и аптечные операции', icon: '✚', defaults: JSON.stringify({ area: 45000, operations: 50000, staff: 300, salary: 60000, shifts: 3, workingDays: 365, electricity: 10, avgWeight: 120 }) },
    { id: 'custom', industry_id: 'other', name: 'Произвольный объект', shortName: 'Произвольный', description: 'Настройте отрасль, площадь и операционные показатели', icon: '◇', defaults: JSON.stringify({ area: 2000, operations: 3000, staff: 20, salary: 80000, shifts: 1, workingDays: 250, electricity: 10, avgWeight: 8 }) },
  ];

  const insertObjectType = db.prepare(`
    INSERT OR REPLACE INTO object_types (id, industry_id, name, short_name, description, icon, defaults)
    VALUES (@id, @industry_id, @name, @shortName, @description, @icon, @defaults)
  `);
  objectTypes.forEach(t => insertObjectType.run(t));

  const solutionTypes = [
    { id: 'mobile', name: 'Мобильные роботы', description: 'AMR/AGV для перемещения грузов и материалов' },
    { id: 'agv', name: 'Автономные наземные транспортные средства', description: 'Автономные вилочные погрузчики и тягачи' },
    { id: 'manipulator', name: 'Роботы-манипуляторы', description: 'Промышленные манипуляторы для сборки и погрузки' },
    { id: 'stationary', name: 'Стационарные роботизированные системы', description: 'Умные системы хранения и сортировки' },
    { id: 'cleaning', name: 'Роботы-уборщики', description: 'Автономные системы уборки' },
    { id: 'delivery', name: 'Роботы-доставщики', description: 'Роботы для доставки товаров и материалов' },
    { id: 'inspection', name: 'Роботы-инспекторы', description: 'Роботы для контроля и инспекции' },
    { id: 'software', name: 'Программное обеспечение', description: 'Системы управления и оптимизации' },
    { id: 'custom', name: 'Прочее', description: 'Прочие типы решений' },
  ];

  const insertSolutionType = db.prepare(`
    INSERT OR REPLACE INTO solution_types (id, name, description)
    VALUES (@id, @name, @description)
  `);
  solutionTypes.forEach(t => insertSolutionType.run(t));

  let solutions = [];
  if (fs.existsSync(CATALOG_CSV)) {
    solutions = await parseCatalogCsv(CATALOG_CSV);
    console.log(`Parsed ${solutions.length} solutions from catalog CSV`);
  } else {
    console.log('Catalog CSV not found, using demo solutions');
    solutions = getDemoSolutions();
  }

  const insertSolution = db.prepare(`
    INSERT OR REPLACE INTO solutions 
    (id, name, vendor, type, solution_type_id, category, subtype, description, features, applicable_to,
     throughput, payload, accuracy, operating_hours, footprint, autonomy, reliability,
     labor_reduction, productivity_lift, co2_reduction, power_kw, implementation_months,
     price, source, source_date, verified, rating, market_potential, region, industry, status, fit)
    VALUES (@id, @name, @vendor, @type, @solution_type_id, @category, @subtype, @description,
            @features, @applicable_to, @throughput, @payload, @accuracy, @operating_hours, @footprint,
            @autonomy, @reliability, @labor_reduction, @productivity_lift, @co2_reduction, @power_kw,
            @implementation_months, @price, @source, @source_date, @verified, @rating, @market_potential,
            @region, @industry, @status, @fit)
  `);

  const insertSolutionStmt = db.prepare(`
    INSERT OR REPLACE INTO solutions 
    (id, name, vendor, type, solution_type_id, category, subtype, description, features, applicable_to,
     throughput, payload, accuracy, operating_hours, footprint, autonomy, reliability,
     labor_reduction, productivity_lift, co2_reduction, power_kw, implementation_months,
     price, source, source_date, verified, rating, market_potential, region, industry, status, fit)
    VALUES (@id, @name, @vendor, @type, @solution_type_id, @category, @subtype, @description,
            @features, @applicable_to, @throughput, @payload, @accuracy, @operating_hours, @footprint,
            @autonomy, @reliability, @labor_reduction, @productivity_lift, @co2_reduction, @power_kw,
            @implementation_months, @price, @source, @source_date, @verified, @rating, @market_potential,
            @region, @industry, @status, @fit)
  `);

  let inserted = 0;
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO solutions 
    (id, name, vendor, type, solution_type_id, category, subtype, description, features, applicable_to,
     throughput, payload, accuracy, operating_hours, footprint, autonomy, reliability,
     labor_reduction, productivity_lift, co2_reduction, power_kw, implementation_months,
     price, source, source_date, verified, rating, market_potential, region, industry, status, fit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  solutions.forEach(s => {
    const features = s.features || [];
    if (Array.isArray(features)) {
      s.features = JSON.stringify(features);
    }
    insertStmt.run(
      s.id, s.name, s.vendor, s.type, s.solution_type_id || s.type || 'mobile',
      s.category || '', s.subtype || '', s.description || '', s.features || '[]',
      s.applicable_to || '', s.throughput, s.payload, s.accuracy, s.operating_hours,
      s.footprint, s.autonomy, s.reliability, s.labor_reduction, s.productivity_lift,
      s.co2_reduction, s.power_kw, s.implementation_months, s.price, s.source || '',
      s.source_date || '', s.verified || 0, s.rating, s.market_potential,
      s.region || '', s.industry || '', s.status || '', s.fit
    );
    inserted++;
  });
  console.log(`Inserted ${inserted} solutions`);

  try {
    const datasets = await parseDatasets(DATASETS_XLSX);
    const insertParam = db.prepare(`
      INSERT OR REPLACE INTO parameters 
      (object_type_id, key, label, unit, param_min, param_max, default_value, description, source, is_required, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const paramKeyMap = {
      'Общая площадь склада': { key: 'area', sort: 1 },
      'Площадь активной (роботизируемой) зоны': { key: 'active_area', sort: 2 },
      'Высота потолков в зоне хранения': { key: 'storage_height', sort: 3 },
      'Количество этажей (мезонинов)': { key: 'floors', sort: 4 },
      'Ширина главных проездов': { key: 'corridor_width', sort: 5 },
      'Ширина рабочих проходов между стеллажами': { key: 'aisle_width', sort: 6 },
      'Тип напольного покрытия': { key: 'floor_type', sort: 7 },
      'Ровность пола (отклонение)': { key: 'floor_flatness', sort: 8 },
      'Количество рабочих смен в сутки': { key: 'shifts', sort: 10 },
      'Рабочих дней в году': { key: 'working_days', sort: 11 },
      'Продолжительность смены': { key: 'shift_hours', sort: 12 },
      'Пиковый коэффициент нагрузки': { key: 'peak_factor', sort: 13 },
      'Объём приёмки (поддоны/сутки)': { key: 'receiving_volume', sort: 20 },
      'Объём отгрузки (поддоны/сутки)': { key: 'shipping_volume', sort: 21 },
      'Объём отбора (строк/сутки, всего)': { key: 'picks_per_day', sort: 22 },
      'Объём отбора (штук/сутки, всего)': { key: 'units_per_day', sort: 23 },
      'Доля мелкоштучного отбора (piece-pick)': { key: 'piece_pick_ratio', sort: 24 },
      'Количество SKU (активных)': { key: 'sku_count', sort: 25 },
      'Доля SKU с быстрым оборотом (A-класс)': { key: 'fast_moving_ratio', sort: 26 },
      'Общая численность персонала склада': { key: 'staff', sort: 30 },
      'Из них: отборщики (комплектовщики)': { key: 'pickers', sort: 31 },
      'Из них: операторы погрузчиков': { key: 'forklift_operators', sort: 32 },
      'Средняя з/п отборщика (gross)': { key: 'salary', sort: 33 },
      'Средняя з/п оператора погрузчика (gross)': { key: 'forklift_salary', sort: 34 },
      'Коэффициент начислений на ФОТ': { key: 'payroll_factor', sort: 35 },
      'Средняя выработка отборщика (строк/ч)': { key: 'picker_productivity', sort: 36 },
      'Коэффициент потерь рабочего времени': { key: 'time_loss_factor', sort: 37 },
      'Средняя длина маршрута отборщика на 1 строку': { key: 'avg_route_length', sort: 40 },
      'Протяжённость конвейерной/транспортной системы': { key: 'conveyor_length', sort: 41 },
      'Тип стеллажной системы': { key: 'storage_type', sort: 50 },
      'Количество паллетомест': { key: 'pallet_places', sort: 51 },
      'Средняя масса грузовой единицы (паллет)': { key: 'avg_pallet_weight', sort: 52 },
      'Средняя масса штучной единицы (SKU)': { key: 'avg_sku_weight', sort: 53 },
      'Доля негабаритных/нестандартных грузов': { key: 'oversize_ratio', sort: 54 },
      'Мощность электроснабжения (доступная)': { key: 'power_capacity', sort: 60 },
      'Наличие WMS': { key: 'has_wms', sort: 61 },
      'Наличие ERP/1С': { key: 'has_erp', sort: 62 },
      'Планируемый бюджет на роботизацию (CAPEX)': { key: 'capex_budget', sort: 63 },
      'Горизонт расчёта окупаемости': { key: 'payback_horizon', sort: 64 },
    };

    Object.keys(datasets).forEach(objTypeId => {
      const params = datasets[objTypeId];
      params.forEach((p, idx) => {
        const mapping = paramKeyMap[p.param];
        if (mapping) {
          insertParam.run(
            objTypeId,
            mapping.key,
            p.param,
            p.unit || '',
            typeof p.min === 'number' ? p.min : null,
            typeof p.max === 'number' ? p.max : null,
            typeof p.defaultValue === 'number' ? p.defaultValue : null,
            p.note || '',
            'Датасет хакатона',
            mapping.sort
          );
        }
      });
    });
    console.log(`Imported dataset parameters`);
  } catch (e) {
    console.log('Could not parse datasets:', e.message);
  }

  const adminEmail = 'admin@robplatform.local';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(
      adminEmail, 'Администратор', adminPass, 'admin'
    );
    console.log('Created admin user: admin@robplatform.local / admin123');
  }

  const demoEmail = 'demo@robplatform.local';
  const existingDemo = db.prepare('SELECT id FROM users WHERE email = ?').get(demoEmail);
  if (!existingDemo) {
    const demoPass = bcrypt.hashSync('demo123', 10);
    db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(
      demoEmail, 'Демо Пользователь', demoPass, 'user'
    );
    console.log('Created demo user: demo@robplatform.local / demo123');
  }

  db.exec('COMMIT');
  console.log('Seed completed successfully!');
  return true;
}

function getDemoSolutions() {
  return [
    { id: 'amr-pallet', name: 'AMR-Pallet 500', vendor: 'RoboCore', type: 'brs', category: 'Мобильные роботы', subtype: 'AMR', throughput: 22, payload: 500, accuracy: 99.2, operating_hours: 20, footprint: 1.2, autonomy: 12, reliability: 98.5, labor_reduction: 0.35, productivity_lift: 0.28, co2_reduction: 0.18, power_kw: 1.8, implementation_months: 3, price: 3800000, source: 'Демонстрационный каталог', solution_type_id: 'mobile', applicable_to: 'warehouse,airport,terminal,custom', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 94 },
    { id: 'amr-shuttle', name: 'AMR-Shuttle 120', vendor: 'Vector Motion', type: 'brs', category: 'Мобильные роботы', subtype: 'AMR', throughput: 38, payload: 120, accuracy: 99.5, operating_hours: 18, footprint: 0.9, autonomy: 10, reliability: 98.8, labor_reduction: 0.28, productivity_lift: 0.24, co2_reduction: 0.16, power_kw: 1.2, implementation_months: 2, price: 2900000, source: 'Демонстрационный каталог', solution_type_id: 'mobile', applicable_to: 'warehouse,retail,airport,medical,campus,custom', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 91 },
    { id: 'forklift-auto', name: 'AutoForklift X2', vendor: 'LiftTech', type: 'brs', category: 'Мобильные роботы', subtype: 'AMR', throughput: 28, payload: 2000, accuracy: 98.9, operating_hours: 18, footprint: 2.4, autonomy: 8, reliability: 97.8, labor_reduction: 0.5, productivity_lift: 0.35, co2_reduction: 0.22, power_kw: 4.5, implementation_months: 4, price: 5500000, source: 'Демонстрационный каталог', solution_type_id: 'mobile', applicable_to: 'warehouse,airport,terminal,custom', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 88 },
    { id: 'sort-line', name: 'SortLine Flex', vendor: 'Flow Systems', type: 'brs', category: 'Мобильные роботы', subtype: '', throughput: 1200, payload: 35, accuracy: 99.8, operating_hours: 22, footprint: 48, autonomy: 0, reliability: 99.1, labor_reduction: 0.62, productivity_lift: 0.75, co2_reduction: 0.12, power_kw: 12, implementation_months: 8, price: 18500000, source: 'Демонстрационный каталог', solution_type_id: 'stationary', applicable_to: 'warehouse,airport,terminal', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 86 },
    { id: 'clean-robot', name: 'CleanBot Pro', vendor: 'Civic Robotics', type: 'brs', category: 'Мобильные роботы', subtype: 'Робот-уборщик', throughput: 1800, payload: 45, accuracy: 97.8, operating_hours: 12, footprint: 1.1, autonomy: 5, reliability: 97.2, labor_reduction: 0.3, productivity_lift: 0.25, co2_reduction: 0.14, power_kw: 1.1, implementation_months: 2, price: 1600000, source: 'Демонстрационный каталог', solution_type_id: 'cleaning', applicable_to: 'airport,medical,campus,retail,custom', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 84 },
    { id: 'inventory-drone', name: 'Inventory Drone A3', vendor: 'SkyCount', type: 'brs', category: 'Мобильные роботы', subtype: '', throughput: 600, payload: 1.5, accuracy: 98.7, operating_hours: 6, footprint: 0.4, autonomy: 0.6, reliability: 96.8, labor_reduction: 0.2, productivity_lift: 0.2, co2_reduction: 0.08, power_kw: 0.8, implementation_months: 2, price: 2400000, source: 'Демонстрационный каталог', solution_type_id: 'inspection', applicable_to: 'warehouse,airport,terminal,medical,custom', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 82 },
    { id: 'baggage-amr', name: 'Baggage AMR B7', vendor: 'AeroMove', type: 'brs', category: 'Мобильные роботы', subtype: '', throughput: 65, payload: 700, accuracy: 99.4, operating_hours: 22, footprint: 2, autonomy: 10, reliability: 98.9, labor_reduction: 0.42, productivity_lift: 0.31, co2_reduction: 0.2, power_kw: 2.2, implementation_months: 5, price: 4700000, source: 'Демонстрационный каталог', solution_type_id: 'mobile', applicable_to: 'airport', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 96 },
    { id: 'delivery-med', name: 'MediBot D1', vendor: 'CarePath', type: 'brs', category: 'Мобильные роботы', subtype: '', throughput: 30, payload: 25, accuracy: 99.7, operating_hours: 18, footprint: 0.8, autonomy: 10, reliability: 99, labor_reduction: 0.38, productivity_lift: 0.27, co2_reduction: 0.1, power_kw: 0.9, implementation_months: 3, price: 2200000, source: 'Демонстрационный каталог', solution_type_id: 'delivery', applicable_to: 'medical', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 93 },
    { id: 'disinfect-uv', name: 'UV-Sterile U5', vendor: 'PureRoute', type: 'brs', category: 'Мобильные роботы', subtype: '', throughput: 900, payload: 18, accuracy: 99.1, operating_hours: 8, footprint: 0.9, autonomy: 4, reliability: 97.5, labor_reduction: 0.25, productivity_lift: 0.2, co2_reduction: 0.09, power_kw: 1.5, implementation_months: 2, price: 1900000, source: 'Демонстрационный каталог', solution_type_id: 'cleaning', applicable_to: 'medical,airport,campus', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 81 },
    { id: 'pharma-arm', name: 'PharmaArm P4', vendor: 'MediAutomation', type: 'brs', category: 'Мобильные роботы', subtype: '', throughput: 120, payload: 8, accuracy: 99.9, operating_hours: 16, footprint: 3.5, autonomy: 0, reliability: 99.3, labor_reduction: 0.45, productivity_lift: 0.42, co2_reduction: 0.06, power_kw: 2.4, implementation_months: 6, price: 7200000, source: 'Демонстрационный каталог', solution_type_id: 'manipulator', applicable_to: 'medical', verified: 1, rating: 8, market_potential: 4.0, region: 'Москва', industry: 'Торговля и услуги', status: 'operation', fit: 90 },
  ];
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed, getDemoSolutions };
