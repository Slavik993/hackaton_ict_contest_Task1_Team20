/* ============================================================================
 * assistant.js — улучшения UX платформы подбора роботизированных решений
 *  1. Чат-помощник на шаге 1 (подбор типа предприятия и уточняющие вопросы)
 *  2. Плавающая панель действий на шаге 2 (кнопка «Далее» всегда на виду)
 *  3. Гарантированный скролл наверх при переходе между шагами
 *  4. Конфигуратор математической модели + чат-помощник на шаге 3
 *  5. Шаг 4 — формальные результаты (вместо визуализации роботов)
 *  6. ИИ-подбор решений с локальным fallback (работает без сервера)
 *
 *  Файл подключается ПОСЛЕ app.js и переопределяет renderStep1..4,
 *  navigateToStep, fetchAIRecommendations и buildAIRecommendationsHTML,
 *  сохраняя всю остальную логику расчётов без изменений.
 * ========================================================================== */

/* -------------------- Вспомогательные данные и функции -------------------- */

var OBJECT_CHAT_KEYWORDS = [
  { keywords: ['склад','warehouse','распределительн','рц','хранен','паллет','сортировочн','логистическ'], industry: 'trade', objectType: 'warehouse', label: 'Склад' },
  { keywords: ['магазин','торговый зал','торгов','ритейл','супермаркет','маркетплейс','бутик','гипермаркет'], industry: 'trade', objectType: 'retail', label: 'Торговый зал' },
  { keywords: ['аэропорт','авиа','воздушн','багаж'], industry: 'logistics', objectType: 'airport', label: 'Аэропорт' },
  { keywords: ['терминал','кросс-док','транспортн','грузовой','порт','контейнерн'], industry: 'logistics', objectType: 'terminal', label: 'Логистический терминал' },
  { keywords: ['больниц','мед','клиник','поликлиник','госпитал','здрав','аптек','лаборатор','реабил'], industry: 'social', objectType: 'medical', label: 'Медучреждение' },
  { keywords: ['кампус','мфц','бизнес-центр','университет','вуз','колледж','офис','администр'], industry: 'social', objectType: 'campus', label: 'Кампус или МФЦ' },
  { keywords: ['производств','завод','цех','фабрик','промышленн'], industry: 'industry', objectType: 'manufacturing', label: 'Производство' },
  { keywords: ['ферм','сельск','агро','теплиц','животновод'], industry: 'agriculture', objectType: 'farm', label: 'Ферма' },
  { keywords: ['жкх','коммунальн','двор','муниципальн','улиц','тротуар','клининг'], industry: 'utilities', objectType: 'municipal', label: 'Коммунальный объект' },
  { keywords: ['строитель','стройплощадк','стройк','дорожн'], industry: 'construction', objectType: 'construction_site', label: 'Стройплощадка' },
  { keywords: ['энерг','тэк','электростанц','котельн','подстанц'], industry: 'energy', objectType: 'energy_facility', label: 'Энергообъект' },
  { keywords: ['лес','лесничеств','лесозаготов'], industry: 'forestry', objectType: 'forest', label: 'Лесничество' },
  { keywords: ['охран','безопасн','патрул','охраняем'], industry: 'security', objectType: 'security_site', label: 'Охраняемый объект' }
];

var MODEL_RATIO_DEFAULTS = {
  infrastructureRatio: 0.15,
  softwareRatio: 0.10,
  integrationRatio: 0.15,
  trainingRatio: 0.05,
  reserveRatio: 0.10,
  serviceRatio: 0.10,
  licenseRatio: 0.05,
  materialRatio: 0.03,
  repairRatio: 0.02,
  managementRatio: 0.05
};

var MODEL_RATIO_LABELS = {
  infrastructureRatio: 'Инфраструктура',
  softwareRatio: 'ПО',
  integrationRatio: 'Интеграция',
  trainingRatio: 'Обучение',
  reserveRatio: 'Резерв',
  serviceRatio: 'Сервис (OPEX)',
  licenseRatio: 'Лицензии (OPEX)',
  materialRatio: 'Материалы (OPEX)',
  repairRatio: 'Ремонт (OPEX)',
  managementRatio: 'Управление (OPEX)'
};

function ensureObjectChat() {
  if (!state.objectChat) {
    state.objectChat = {
      step: 'ask',
      pending: null,
      answers: {},
      messages: [
        { role: 'bot', text: 'Привет! Я помогу выбрать тип предприятия. Опишите его одним словом или фразой, например: «склад», «аэропорт», «больница», «ферма» — или выберите вариант ниже.' }
      ]
    };
  }
}

function ensureModelChat() {
  if (!state.modelChat) {
    state.modelChat = {
      messages: [
        { role: 'bot', text: 'Привет! Я помогу адаптировать математическую модель под вашу ситуацию. Например:\n• «увеличь затраты на обучение»\n• «нужна большая интеграция»\n• «сделай модель консервативнее»\n• «покажи коэффициенты»\n• «сбрось модель к стандартной»' }
      ]
    };
  }
}

function findObjectByText(text) {
  var lower = String(text || '').toLowerCase();
  for (var i = 0; i < OBJECT_CHAT_KEYWORDS.length; i++) {
    var item = OBJECT_CHAT_KEYWORDS[i];
    for (var j = 0; j < item.keywords.length; j++) {
      if (lower.indexOf(item.keywords[j]) !== -1) return item;
    }
  }
  return null;
}

function applyObjectChatChoice(item) {
  state.selectedIndustry = item.industry;
  state.selectedObjectType = item.objectType;
  state.customObjectName = '';
  state.selectedSolutions = [];
  state.calculationSolutionId = null;
  state.filterType = 'all';
  state.searchQuery = '';
  state.aiRecommendations = null;
  var d = getDefaults(item.industry, item.objectType);
  if (d && Object.keys(d).length) {
    d.objectType = item.objectType;
    d.industry = item.industry;
    d.industryName = ((HACKATHON_DATA.industries || []).find(function(i) { return i.id === item.industry; }) || {}).name || '';
    var indObj = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === item.industry; });
    var otObj = indObj ? (indObj.objectTypes || []).find(function(t) { return t.id === item.objectType; }) : null;
    d.objectTypeName = otObj ? otObj.name : '';
    state.customParams = JSON.parse(JSON.stringify(d));
  }
  var answers = state.objectChat ? state.objectChat.answers : {};
  var mapping = { area: 'area', operations: 'operations', staff: 'staff', salary: 'salary' };
  Object.keys(mapping).forEach(function(k) {
    if (answers[k] !== undefined) state.customParams[mapping[k]] = answers[k];
  });
  saveState();
}

function handleObjectChatInput(rawText) {
  var text = String(rawText || '').trim();
  if (!text) return;
  ensureObjectChat();
  var chat = state.objectChat;
  chat.messages.push({ role: 'user', text: text });

  if (chat.step === 'ask') {
    var item = findObjectByText(text);
    if (item) {
      chat.pending = item;
      chat.step = 'area';
      chat.messages.push({ role: 'bot', text: 'Отлично! Похоже, ваше предприятие — «' + item.label + '». Уточним параметры для расчёта.\n\n📐 Какая площадь объекта (м²)? Например, 8000.' });
    } else {
      chat.messages.push({ role: 'bot', text: 'Не удалось распознать тип. Попробуйте написать иначе или выберите один из вариантов ниже.' });
    }
  } else if (chat.step === 'area') {
    var area = safeFloat(text, NaN);
    if (isNaN(area)) {
      chat.messages.push({ role: 'bot', text: 'Введите число, например 8000.' });
    } else {
      chat.answers.area = area;
      chat.step = 'operations';
      chat.messages.push({ role: 'bot', text: '✅ Площадь: ' + formatNum(area, 0) + ' м².\n\n📦 Какой объём операций в год? Например, 18000.' });
    }
  } else if (chat.step === 'operations') {
    var operations = safeFloat(text, NaN);
    if (isNaN(operations)) {
      chat.messages.push({ role: 'bot', text: 'Введите число, например 18000.' });
    } else {
      chat.answers.operations = operations;
      chat.step = 'staff';
      chat.messages.push({ role: 'bot', text: '✅ Объём операций: ' + formatNum(operations, 0) + ' в год.\n\n👷 Сколько сотрудников занято в операциях? Например, 60.' });
    }
  } else if (chat.step === 'staff') {
    var staff = safeFloat(text, NaN);
    if (isNaN(staff)) {
      chat.messages.push({ role: 'bot', text: 'Введите число, например 60.' });
    } else {
      chat.answers.staff = staff;
      chat.step = 'salary';
      chat.messages.push({ role: 'bot', text: '✅ Персонал: ' + formatNum(staff, 0) + ' чел.\n\n💰 Средняя зарплата (₽/мес.)? Например, 82000.' });
    }
  } else if (chat.step === 'salary') {
    var salary = safeFloat(text, NaN);
    if (isNaN(salary)) {
      chat.messages.push({ role: 'bot', text: 'Введите число, например 82000.' });
    } else {
      chat.answers.salary = salary;
      chat.step = 'done';
      if (chat.pending) {
        chat.messages.push({ role: 'bot', text: '✅ Все параметры собраны. Сейчас выберу тип объекта «' + chat.pending.label + '» и подставлю ваши значения.' });
        applyObjectChatChoice(chat.pending);
        chat.pending = null;
        chat.step = 'ask';
        chat.answers = {};
        chat.messages.push({ role: 'bot', text: 'Тип объекта выбран! Могу помочь выбрать другой — просто опишите его.' });
      } else {
        chat.step = 'ask';
        chat.messages.push({ role: 'bot', text: 'Опишите предприятие ещё раз или выберите вариант ниже.' });
      }
    }
  } else {
    var item2 = findObjectByText(text);
    if (item2) {
      chat.pending = item2;
      chat.step = 'area';
      chat.messages.push({ role: 'bot', text: 'Похоже, ваше предприятие — «' + item2.label + '». Какая площадь объекта (м²)?' });
    } else {
      chat.messages.push({ role: 'bot', text: 'Не удалось распознать. Опишите предприятие или выберите вариант ниже.' });
    }
  }

  renderCurrentStep();
  var inputEl = document.getElementById('objectChatInput');
  if (inputEl) inputEl.focus();
}

function renderObjectChat(el) {
  var container = el.querySelector('#objectChat');
  if (!container) return;
  ensureObjectChat();
  var messages = state.objectChat.messages || [];
  var html = '<div class="chat-widget">';
  html += '<div class="chat-messages" id="objectChatMessages">';
  messages.forEach(function(m) {
    html += '<div class="chat-msg ' + (m.role === 'bot' ? 'bot' : 'user') + '">' + escapeHTML(m.text) + '</div>';
  });
  html += '</div>';
  html += '<div class="chat-input-row">';
  html += '<input type="text" class="form-input chat-input" id="objectChatInput" placeholder="Например: склад, аэропорт, больница..." autocomplete="off" />';
  html += '<button class="btn btn-primary btn-sm" id="objectChatSend">Отправить</button>';
  html += '</div>';
  html += '<div class="chat-quick" id="objectChatQuick"></div>';
  html += '</div>';
  container.innerHTML = html;

  var quick = container.querySelector('#objectChatQuick');
  var seen = {};
  var chipsHtml = '';
  OBJECT_CHAT_KEYWORDS.forEach(function(item) {
    if (seen[item.label]) return;
    seen[item.label] = true;
    chipsHtml += '<button type="button" class="chip chat-chip" data-label="' + escapeAttr(item.label) + '">' + escapeHTML(item.label) + '</button>';
  });
  quick.innerHTML = chipsHtml;

  var input = container.querySelector('#objectChatInput');
  var sendBtn = container.querySelector('#objectChatSend');
  function doSend() {
    var value = input.value;
    if (!String(value || '').trim()) return;
    input.value = '';
    handleObjectChatInput(value);
  }
  if (sendBtn) sendBtn.addEventListener('click', doSend);
  if (input) {
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSend(); });
  }
  container.querySelectorAll('.chat-chip').forEach(function(chip) {
    chip.addEventListener('click', function() { handleObjectChatInput(chip.dataset.label); });
  });

  var messagesEl = container.querySelector('#objectChatMessages');
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ---------------------- Чат-помощник по мат. модели ---------------------- */

function buildModelRatiosSummary() {
  var lines = [];
  Object.keys(MODEL_RATIO_DEFAULTS).forEach(function(key) {
    var val = safeFloat(state.customParams[key], MODEL_RATIO_DEFAULTS[key]);
    lines.push('• ' + (MODEL_RATIO_LABELS[key] || key) + ': ' + val.toFixed(2));
  });
  var disc = safeFloat(state.customParams.discountRate, 10);
  lines.push('• Дисконтная ставка: ' + disc.toFixed(1) + '%');
  return lines.join('\n');
}

function handleModelChatInput(rawText) {
  var text = String(rawText || '').trim().toLowerCase();
  if (!text) return;
  ensureModelChat();
  var chat = state.modelChat;
  chat.messages.push({ role: 'user', text: rawText });
  var response = '';
  var changed = false;

  function bump(key, defaultVal, delta, max, label) {
    var cur = safeFloat(state.customParams[key], defaultVal);
    var next = clamp(cur + delta, 0, max);
    state.customParams[key] = next;
    return { cur: cur, next: next, label: label };
  }

  if (text.indexOf('обучен') !== -1 || text.indexOf('training') !== -1 || text.indexOf('персонал') !== -1) {
    var r = bump('trainingRatio', 0.05, 0.02, 0.3, 'Обучение');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля CAPEX).';
    changed = true;
  } else if (text.indexOf('интеграц') !== -1) {
    var r = bump('integrationRatio', 0.15, 0.02, 0.4, 'Интеграция');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля CAPEX).';
    changed = true;
  } else if (text.indexOf('сервис') !== -1 || text.indexOf('обслуж') !== -1 || text.indexOf('поддержк') !== -1) {
    var r = bump('serviceRatio', 0.10, 0.02, 0.3, 'Сервисное обслуживание');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля OPEX).';
    changed = true;
  } else if (text.indexOf('лиценз') !== -1) {
    var r = bump('licenseRatio', 0.05, 0.02, 0.3, 'Лицензии');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля OPEX).';
    changed = true;
  } else if (text.indexOf('инфраструктур') !== -1) {
    var r = bump('infrastructureRatio', 0.15, 0.02, 0.4, 'Инфраструктура');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля CAPEX).';
    changed = true;
  } else if (text.indexOf('резерв') !== -1) {
    var r = bump('reserveRatio', 0.10, 0.02, 0.3, 'Резерв');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля CAPEX).';
    changed = true;
  } else if (text.indexOf('программ') !== -1 || text.indexOf('софт') !== -1 || text.indexOf('software') !== -1) {
    var r = bump('softwareRatio', 0.10, 0.02, 0.3, 'ПО');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля CAPEX).';
    changed = true;
  } else if (text.indexOf('материал') !== -1) {
    var r = bump('materialRatio', 0.03, 0.01, 0.2, 'Материалы');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля OPEX).';
    changed = true;
  } else if (text.indexOf('ремонт') !== -1) {
    var r = bump('repairRatio', 0.02, 0.01, 0.2, 'Ремонт');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля OPEX).';
    changed = true;
  } else if (text.indexOf('управлен') !== -1) {
    var r = bump('managementRatio', 0.05, 0.01, 0.2, 'Управление');
    response = '✅ ' + r.label + ': ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + ' (доля OPEX).';
    changed = true;
  } else if (text.indexOf('быстрее') !== -1 || text.indexOf('ускор') !== -1 || text.indexOf('меньше срок') !== -1 || text.indexOf('оптимист') !== -1 || text.indexOf('агрессивн') !== -1) {
    var cur = safeFloat(state.customParams.discountRate, 10);
    var next = clamp(cur - 1, 0, 30);
    state.customParams.discountRate = next;
    response = '✅ Дисконтная ставка: ' + cur.toFixed(1) + '% → ' + next.toFixed(1) + '%. Модель стала более оптимистичной.';
    changed = true;
  } else if (text.indexOf('консерватив') !== -1 || text.indexOf('осторожн') !== -1 || text.indexOf('риск') !== -1) {
    var cur = safeFloat(state.customParams.discountRate, 10);
    var next = clamp(cur + 2, 0, 30);
    state.customParams.discountRate = next;
    var r = bump('reserveRatio', 0.10, 0.02, 0.3, 'Резерв');
    response = '✅ Модель стала консервативнее: дисконт ' + cur.toFixed(1) + '% → ' + next.toFixed(1) + '%, резерв ' + r.cur.toFixed(2) + ' → ' + r.next.toFixed(2) + '.';
    changed = true;
  } else if (text.indexOf('сброс') !== -1 || text.indexOf('сбрось') !== -1 || text.indexOf('дефолт') !== -1 || text.indexOf('стандарт') !== -1) {
    var ratioKeys = Object.keys(MODEL_RATIO_DEFAULTS);
    ratioKeys.forEach(function(k) { delete state.customParams[k]; });
    state.customParams.discountRate = 10;
    response = '✅ Коэффициенты модели сброшены к стандартным значениям.';
    changed = true;
  } else if (text.indexOf('формул') !== -1 || text.indexOf('покажи') !== -1 || text.indexOf('коэффициент') !== -1 || text.indexOf('модел') !== -1 || text.indexOf('что за') !== -1) {
    response = '📋 Текущие коэффициенты модели:\n' + buildModelRatiosSummary();
  } else {
    response = 'Я могу помочь настроить модель. Попробуйте, например:\n• «увеличь затраты на обучение»\n• «нужна большая интеграция»\n• «сделай модель консервативнее»\n• «покажи коэффициенты»\n• «сбрось модель к стандартной»';
  }

  chat.messages.push({ role: 'bot', text: response });
  if (changed) {
    chat.messages.push({ role: 'bot', text: '⚡ Результаты пересчитаны с учётом новых параметров.' });
  }
  saveState();
  renderCurrentStep();
  var inputEl = document.getElementById('modelChatInput');
  if (inputEl) inputEl.focus();
}

function renderModelChat(el) {
  var container = el.querySelector('#modelChat');
  if (!container) return;
  ensureModelChat();
  var messages = state.modelChat.messages || [];
  var html = '<div class="chat-widget">';
  html += '<div class="chat-messages" id="modelChatMessages">';
  messages.forEach(function(m) {
    html += '<div class="chat-msg ' + (m.role === 'bot' ? 'bot' : 'user') + '">' + escapeHTML(m.text) + '</div>';
  });
  html += '</div>';
  html += '<div class="chat-input-row">';
  html += '<input type="text" class="form-input chat-input" id="modelChatInput" placeholder="Например: увеличь затраты на обучение..." autocomplete="off" />';
  html += '<button class="btn btn-primary btn-sm" id="modelChatSend">Отправить</button>';
  html += '</div>';
  html += '<div class="chat-quick" id="modelChatQuick"></div>';
  html += '</div>';
  container.innerHTML = html;

  var quick = container.querySelector('#modelChatQuick');
  var chips = [
    'Увеличить обучение',
    'Больше интеграции',
    'Консервативнее',
    'Покажи коэффициенты',
    'Сброс к стандартной'
  ];
  var chipsHtml = '';
  chips.forEach(function(label) {
    chipsHtml += '<button type="button" class="chip chat-chip" data-label="' + escapeAttr(label) + '">' + escapeHTML(label) + '</button>';
  });
  quick.innerHTML = chipsHtml;

  var input = container.querySelector('#modelChatInput');
  var sendBtn = container.querySelector('#modelChatSend');
  function doSend() {
    var value = input.value;
    if (!String(value || '').trim()) return;
    input.value = '';
    handleModelChatInput(value);
  }
  if (sendBtn) sendBtn.addEventListener('click', doSend);
  if (input) {
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSend(); });
  }
  container.querySelectorAll('.chat-chip').forEach(function(chip) {
    chip.addEventListener('click', function() { handleModelChatInput(chip.dataset.label); });
  });

  var messagesEl = container.querySelector('#modelChatMessages');
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* -------------------- Локальный ИИ-подбор (fallback) --------------------- */

function localRecommendSolutions(objectTypeId, query) {
  var q = String(query || '').toLowerCase().trim();
  var solutions = (HACKATHON_DATA.solutions || []).filter(function(s) {
    return s.applicableTo && s.applicableTo.indexOf(objectTypeId) !== -1;
  });

  var ranked = solutions.map(function(s) {
    var haystack = ((s.name || '') + ' ' + (s.vendor || '') + ' ' + (s.description || '') + ' ' + (s.features || []).join(' ')).toLowerCase();
    var textScore = q ? (haystack.indexOf(q) !== -1 ? 1 : 0) : 0;
    var fitScore = clamp(safeFloat(s.fit, 50), 0, 100) / 100;
    var score = 0.75 * fitScore + 0.25 * textScore;
    return { solution: s, score: score, textScore: textScore };
  }).filter(function(r) { return r.score > 0; })
    .sort(function(a, b) { return b.score - a.score; });

  return ranked.slice(0, 8).map(function(r) {
    var s = r.solution;
    return {
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      type: s.type,
      description: s.description,
      source: s.source,
      features: s.features,
      metrics: s.metrics || {},
      fit: s.fit,
      aiScore: Math.round(r.score * 100),
      explanation: r.textScore ? 'Совпадение с запросом и типом объекта' : 'Соответствует типу объекта',
      economicPreview: null
    };
  });
}

function fetchAIRecommendations(el) {
  var panel = el.querySelector('#aiRecommendationsPanel');
  var loading = el.querySelector('#aiLoading');
  if (!panel || !loading) return;

  loading.style.display = 'inline-block';
  panel.style.display = 'none';
  panel.innerHTML = '';

  var body = {
    objectTypeId: state.selectedObjectType,
    params: Object.assign({}, state.customParams),
    query: state.searchQuery || '',
    limit: 8
  };

  function showRecommendations(recs, offline) {
    loading.style.display = 'none';
    state.aiRecommendations = recs || [];
    saveState();
    renderCurrentStep();
    if (offline && (!recs || !recs.length)) {
      showToast('Подходящих решений не найдено', 'warning');
    } else if (offline) {
      showToast('Сервер недоступен — подбор выполнен локально', 'warning');
    }
  }

  if (typeof fetch !== 'function') {
    showRecommendations(localRecommendSolutions(state.selectedObjectType, state.searchQuery || ''), true);
    return;
  }

  fetch('/api/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function(data) {
    if (data.recommendations && data.recommendations.length > 0) {
      showRecommendations(data.recommendations, false);
    } else {
      showRecommendations(localRecommendSolutions(state.selectedObjectType, state.searchQuery || ''), true);
    }
  })
  .catch(function() {
    showRecommendations(localRecommendSolutions(state.selectedObjectType, state.searchQuery || ''), true);
  });
}

function buildAIRecommendationsHTML(recs) {
  if (!recs || !recs.length) {
    return '<div class="panel" style="margin-bottom:24px"><div class="panel-title">🧠 ИИ-рекомендации</div><div class="form-hint">ИИ не нашёл подходящих решений. Попробуйте изменить параметры или поисковый запрос.</div></div>';
  }

  var maxScore = Math.max.apply(null, recs.map(function(r) { return r.aiScore || 0; }));
  var html = '<div class="panel ai-recommendations-panel" style="margin-bottom:24px">';
  html += '<div class="panel-title">🧠 ИИ-рекомендации <span class="ai-count-badge">' + recs.length + '</span></div>';
  html += '<p class="section-desc" style="margin-bottom:16px">Решения ранжированы по экономической эффективности, совпадению с задачей и параметрам объекта. Нажмите «Добавить в сравнение», затем — кнопку «Далее: Расчёт экономики».</p>';

  html += '<div class="ai-top-strip">';
  recs.slice(0, 3).forEach(function(r, idx) {
    html += '<div class="ai-top-item rank-' + (idx + 1) + '">';
    html += '<div class="ai-rank-num">' + (idx + 1) + '</div>';
    html += '<div class="ai-top-name">' + escapeHTML(r.name || 'Без названия') + '</div>';
    html += '<div class="ai-top-meta">Балл ' + (r.aiScore || 0) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="card-grid ai-rec-grid">';
  recs.forEach(function(r, idx) {
    var isAdded = state.selectedSolutions.some(function(sl) { return sl.id === r.id; });
    var scorePct = maxScore > 0 ? Math.round(((r.aiScore || 0) / maxScore) * 100) : 0;
    var isTop = idx < 3;

    html += '<div class="card ai-recommendation-card' + (isTop ? ' ai-top-card' : '') + (isAdded ? ' added' : '') + '" data-solution-id="' + escapeAttr(r.id) + '">';
    html += '<div class="ai-card-rank">' + (idx + 1) + '</div>';
    html += '<div class="card-header">';
    html += '<div class="card-title">' + escapeHTML(r.name || 'Без названия') + '</div>';
    html += '<div class="ai-badges">';
    html += '<span class="card-badge ai-score" title="ИИ-балл">' + (r.aiScore || 0) + '</span>';
    html += '<span class="card-badge fit">' + Math.round(r.fit || 0) + '%</span>';
    html += '</div></div>';

    html += '<div class="ai-score-bar-wrap"><div class="ai-score-bar" style="width:' + scorePct + '%"></div></div>';

    html += '<p class="card-subtitle">' + escapeHTML(r.vendor || 'Неизвестный вендор') + ' · ' + escapeHTML(r.source || '') + '</p>';
    html += '<p class="card-description">' + escapeHTML((r.description || '').substring(0, 140)) + ((r.description || '').length > 140 ? '…' : '') + '</p>';

    if (r.explanation) {
      html += '<div class="ai-explanation">' + escapeHTML(r.explanation) + '</div>';
    }

    html += '<div class="ai-econ-grid">';
    var eco = r.economicPreview || {};
    if (eco.robotCount) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">Роботов</span><span class="ai-econ-val">' + eco.robotCount + '</span></div>';
    }
    if (eco.payback != null && eco.payback >= 0) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">Окупаемость</span><span class="ai-econ-val">' + formatNum(eco.payback, 1) + ' лет</span></div>';
    }
    if (eco.npv != null) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">NPV</span><span class="ai-econ-val">' + formatCurrency(eco.npv) + '</span></div>';
    }
    if (!eco.robotCount && !eco.payback && eco.npv == null) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">Экономика</span><span class="ai-econ-val">—</span></div>';
    }
    html += '</div>';

    html += '<div class="ai-card-actions">';
    html += '<button class="btn btn-sm ' + (isAdded ? 'btn-success' : 'btn-primary') + '" data-ai-add="' + escapeAttr(r.id) + '"' + (isAdded ? ' disabled' : '') + '>' + (isAdded ? '✓ Добавлено' : 'Добавить в сравнение') + '</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function bindAIRecsPanel(el) {
  var panel = el.querySelector('#aiRecommendationsPanel');
  if (!panel || !state.aiRecommendations || !state.aiRecommendations.length) return;

  panel.innerHTML = buildAIRecommendationsHTML(state.aiRecommendations);
  panel.style.display = 'block';

  panel.querySelectorAll('[data-ai-add]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var sid = btn.dataset.aiAdd;
      var sol = state.aiRecommendations.find(function(r) { return r.id === sid; });
      if (!sol) return;
      if (state.selectedSolutions.length >= 3) {
        showToast('Максимум 3 решения для сравнения', 'warning');
        return;
      }
      if (!state.selectedSolutions.some(function(s) { return s.id === sid; })) {
        var normalized = Object.assign({}, sol, {
          metrics: sol.metrics || {
            throughput: sol.throughput,
            payload: sol.payload,
            accuracy: sol.accuracy,
            reliability: sol.reliability,
            laborReduction: sol.labor_reduction || sol.laborReduction,
            productivityLift: sol.productivity_lift || sol.productivityLift,
            co2Reduction: sol.co2_reduction || sol.co2Reduction,
            capexPerUnit: sol.price || sol.capexPerUnit || (sol.metrics && sol.metrics.capexPerUnit),
            serviceCostPerMonth: sol.serviceCostPerMonth || (sol.metrics && sol.metrics.serviceCostPerMonth) || 0,
            powerKw: sol.power_kw || sol.powerKw || (sol.metrics && sol.metrics.powerKw),
            footprint: sol.footprint || (sol.metrics && sol.metrics.footprint),
            autonomy: sol.autonomy || (sol.metrics && sol.metrics.autonomy),
            implementation: sol.implementation_months || sol.implementation || (sol.metrics && sol.metrics.implementation)
          }
        });
        state.selectedSolutions.push(normalized);
        if (!state.calculationSolutionId) state.calculationSolutionId = sid;
      }
      saveState();
      renderCurrentStep();
      showToast((sol.name || '') + ' добавлено в сравнение', 'success');
    });
  });
}

/* -------------------- Шаг 1: выбор объекта + чат ------------------------- */

function renderStep1(el) {
  var industries = HACKATHON_DATA && HACKATHON_DATA.industries ? HACKATHON_DATA.industries : [];
  var html = '<h2 class="section-title">Выберите отрасль и тип объекта</h2>';
  html += '<p class="section-desc">Выберите отрасль для начала. Каждая отрасль содержит типы объектов с примерами параметров. Вариант &ldquo;Другое&rdquo; позволяет задать произвольный объект. Если не знаете, с чего начать, воспользуйтесь чат-помощником ниже.</p>';
  html += '<div class="card-grid">';
  industries.forEach(function(ind) {
    var selected = state.selectedIndustry === ind.id;
    html += '<div class="card' + (selected ? ' selected' : '') + '" data-industry="' + ind.id + '">';
    html += '<div class="card-header"><div class="card-title">' + (ind.name || 'Без названия') + '</div></div>';
    html += '<p class="card-description">' + (ind.description || '') + '</p>';
    html += '</div>';
  });
  html += '</div>';

  if (state.selectedIndustry) {
    var ind = industries.find(function(i) { return i.id === state.selectedIndustry; });
    var types = ind ? ind.objectTypes : [];
    html += '<h3 class="panel-title" style="margin-top:24px">Типы объектов в отрасли &ldquo;' + (ind ? ind.name : '') + '&rdquo;</h3>';
    html += '<div class="card-grid">';
    types.forEach(function(t) {
      var sel = state.selectedObjectType === t.id;
      html += '<div class="card' + (sel ? ' selected' : '') + '" data-object-type="' + t.id + '">';
      html += '<div class="card-header">';
      html += '<div class="card-title">' + (t.name || 'Без названия') + '</div>';
      html += '<div class="card-badge fit">Пример данных</div>';
      html += '</div>';
      html += '<p class="card-subtitle">' + (t.description || '') + '</p>';
      html += '</div>';
    });
    html += '</div>';

    if (state.selectedObjectType === 'custom') {
      html += '<div class="panel" style="margin-top:24px">';
      html += '<div class="form-group" style="margin-bottom:0"><label class="form-label" for="customObjectName">Название произвольного объекта</label>';
      html += '<input type="text" class="form-input" id="customObjectName" value="' + escapeAttr(state.customObjectName || 'Произвольный объект') + '" maxlength="80"></div>';
      html += '</div>';
    }

    html += '<div class="btn-group-right">';
    html += '<button class="btn btn-secondary" id="btnBack1" data-action="back">Назад</button>';
    html += '<button class="btn btn-primary" id="btnNext1" data-action="next">Далее: Подбор решений</button>';
    html += '</div>';
  }

  html += '<div class="panel" style="margin-top:24px" id="objectChatPanel">';
  html += '<div class="panel-title">🤖 Помощник по выбору объекта</div>';
  html += '<div id="objectChat"></div>';
  html += '</div>';

  el.innerHTML = html;

  el.querySelectorAll('[data-industry]').forEach(function(card) {
    card.addEventListener('click', function() {
      state.selectedIndustry = card.dataset.industry;
      state.selectedObjectType = null;
      state.customObjectName = '';
      state.customParams = {};
      state.selectedSolutions = [];
      state.calculationSolutionId = null;
      state.filterType = 'all';
      state.searchQuery = '';
      state.aiRecommendations = null;
      renderCurrentStep();
      saveState();
    });
  });

  el.querySelectorAll('[data-object-type]').forEach(function(card) {
    card.addEventListener('click', function() {
      state.selectedObjectType = card.dataset.objectType;
      state.selectedSolutions = [];
      state.calculationSolutionId = null;
      state.aiRecommendations = null;
      var d = getDefaults(state.selectedIndustry, state.selectedObjectType);
      if (d && Object.keys(d).length) {
        d.objectType = state.selectedObjectType;
        d.industry = state.selectedIndustry;
        d.industryName = ((HACKATHON_DATA.industries || []).find(function(i){return i.id===state.selectedIndustry;})||{}).name || '';
        var indObj = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
        var otObj = indObj ? (indObj.objectTypes || []).find(function(t) { return t.id === state.selectedObjectType; }) : null;
        d.objectTypeName = otObj ? otObj.name : '';
        state.customParams = JSON.parse(JSON.stringify(d));
      }
      renderCurrentStep();
      saveState();
    });
  });

  var customNameInput = el.querySelector('#customObjectName');
  if (customNameInput) {
    customNameInput.addEventListener('input', function(e) {
      state.customObjectName = e.target.value.trim();
      saveState();
    });
  }

  var btnBack = el.querySelector('#btnBack1');
  var btnNext = el.querySelector('#btnNext1');
  if (btnBack) btnBack.addEventListener('click', function() { navigateToStep(1); });
  if (btnNext) {
    btnNext.addEventListener('click', function() {
      if (!state.selectedObjectType) {
        showToast('Сначала выберите тип объекта', 'warning');
        return;
      }
      navigateToStep(2);
    });
  }

  try {
    renderObjectChat(el);
  } catch (e) {
    console.warn('Object chat render failed:', e);
  }
}

/* -------------------- Шаг 2: каталог + sticky-панель --------------------- */

function renderStep2(el) {
  if (!state.selectedIndustry || !state.selectedObjectType) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">!</div><div class="empty-state-text">Сначала выберите отрасль и тип объекта на шаге 1.</div><button class="btn btn-primary" id="btnGoBack2">Перейти к шагу 1</button></div>';
    var btn = el.querySelector('#btnGoBack2');
    if (btn) btn.addEventListener('click', function() { navigateToStep(1); });
    return;
  }

  var solutions = getApplicableSolutions(state.selectedObjectType);
  var types = HACKATHON_DATA.solutionTypes || [];

  var html = '<h2 class="section-title">Каталог решений</h2>';
  html += '<p class="section-desc">Доступные роботизированные решения для типа объекта &ldquo;' + getObjectTypeName() + '&rdquo;. Выберите до 3 решений для сравнения. Кнопка продолжения закреплена внизу экрана.</p>';

  html += '<div class="search-bar">';
  html += '<input type="text" class="form-input" id="searchInput" placeholder="Поиск по названию или вендору..." value="' + escapeAttr(state.searchQuery) + '">';
  html += '</div>';

  html += '<div class="filter-chips">';
  html += '<span class="chip' + (state.filterType === 'all' ? ' active' : '') + '" data-filter="all">Все типы</span>';
  types.forEach(function(t) {
    html += '<span class="chip' + (state.filterType === t.id ? ' active' : '') + '" data-filter="' + t.id + '">' + (t.name || '') + '</span>';
  });
  html += '</div>';

  html += '<div class="ai-controls" style="display:flex;gap:12px;align-items:center;margin:16px 0">';
  html += '<button class="btn btn-sm btn-secondary" id="btnAIRecommend">🧠 ИИ-Подбор решений</button>';
  html += '<span class="ai-loading" id="aiLoading" style="display:none;font-size:0.8rem;color:var(--color-text-secondary)">Идёт подбор...</span>';
  html += '</div>';
  html += '<div id="aiRecommendationsPanel" style="display:none;margin-bottom:24px"></div>';

  var filtered = solutions.filter(function(s) {
    var matchType = state.filterType === 'all' || s.type === state.filterType;
    var matchSearch = !state.searchQuery || (s.name || '').toLowerCase().indexOf(state.searchQuery.toLowerCase()) !== -1 || (s.vendor || '').toLowerCase().indexOf(state.searchQuery.toLowerCase()) !== -1;
    return matchType && matchSearch;
  });

  if (!filtered.length) {
    html += '<div class="empty-state"><div class="empty-state-icon">~</div><div class="empty-state-text">Нет доступных решений по заданным критериям.</div></div>';
  } else {
    html += '<div class="card-grid">';
    filtered.forEach(function(s) {
      var isSelected = state.selectedSolutions.some(function(sl) { return sl.id === s.id; });
      html += '<div class="card solution-card' + (isSelected ? ' selected' : '') + '" data-solution-id="' + s.id + '">';
      html += '<div class="card-header"><div class="card-title">' + (s.name || 'Без названия') + '</div>';
      html += '<span class="card-badge fit">' + (s.fit || 0) + '%</span></div>';
      html += '<p class="card-subtitle">' + (s.vendor || 'Неизвестный вендор') + ' &middot; ' + (s.source || '') + '</p>';
      html += '<p class="card-description">' + (s.description || '') + '</p>';
      html += '<div class="solution-metrics">';
      var metrics = s.metrics || {};
      ['throughput','accuracy','payload','footprint'].forEach(function(k) {
        if (metrics[k] !== undefined) {
          html += '<span class="metric-pill">' + (HACKATHON_DATA.metricLabels[k] || k) + ': ' + formatMetricValue(k, metrics[k]) + '</span>';
        }
      });
      html += '</div>';
      if (s.features && s.features.length) {
        html += '<p class="card-description" style="margin-top:8px"><strong>Возможности:</strong> ' + s.features.join(', ') + '</p>';
      }
      html += '<div style="margin-top:12px"><label class="checkbox-label"><input type="checkbox"' + (isSelected ? ' checked' : '') + ' data-compare="' + s.id + '"> Сравнивать</label></div>';
      var videoId = getVideoId(s);
      var videoFallback = getVideoCategoryForSolution(s);
      html += '<div class="video-btn-wrapper"><button class="btn btn-sm btn-info video-btn" data-video-id="' + videoId + '" data-video-fallback="' + videoFallback + '" data-solution-name="' + escapeHTML(s.name || '') + '">▶ Видео</button></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (state.selectedSolutions.length > 0) {
    html += '<div class="panel" id="comparePanel" style="margin-top:24px">';
    html += '<div class="panel-title">Сравнение (' + state.selectedSolutions.length + ' из 3)</div>';
    html += buildCompareTable();
    html += '<div class="btn-group" style="justify-content:flex-start">';
    html += '<button class="btn btn-primary" id="btnNext2">Далее: Расчёт экономики</button>';
    html += '<button class="btn btn-secondary" id="btnClearCompare">Очистить сравнение</button>';
    html += '</div>';
    html += '</div>';
  } else {
    html += '<div class="btn-group" style="justify-content:flex-start"><button class="btn btn-secondary" id="btnBack2">Назад</button><button class="btn btn-primary" id="btnNext2" disabled>Выберите хотя бы одно решение</button></div>';
  }

  html += '<div class="sticky-actions" id="stickyActions2">';
  html += '<div class="sticky-actions-info">Выбрано: <strong>' + state.selectedSolutions.length + '</strong> из 3</div>';
  if (state.selectedSolutions.length > 0) {
    html += '<button class="btn btn-primary" id="btnNext2Sticky">Далее: Расчёт экономики →</button>';
    html += '<button class="btn btn-secondary" id="btnScrollCompare">⬇ К сравнению</button>';
  } else {
    html += '<button class="btn btn-primary" id="btnNext2Sticky" disabled>Выберите решения</button>';
    html += '<button class="btn btn-secondary" id="btnScrollCompare">⬆ К началу</button>';
  }
  html += '</div>';

  el.innerHTML = html;

  el.querySelectorAll('.chip[data-filter]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      state.filterType = chip.dataset.filter;
      renderCurrentStep();
    });
  });

  var searchInput = el.querySelector('#searchInput');
  if (searchInput) searchInput.addEventListener('input', function(e) {
    var cursor = e.target.selectionStart;
    state.searchQuery = e.target.value;
    renderCurrentStep();
    var nextInput = document.getElementById('searchInput');
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(cursor, cursor);
    }
  });

  el.querySelectorAll('[data-compare]').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      var sid = e.target.dataset.compare;
      var sol = solutions.find(function(s) { return s.id === sid; });
      if (e.target.checked) {
        if (state.selectedSolutions.length >= 3) {
          e.target.checked = false;
          showToast('Максимум 3 решения для сравнения', 'warning');
          return;
        }
        if (sol && !state.selectedSolutions.some(function(s) { return s.id === sid; })) {
          state.selectedSolutions.push(sol);
          if (!state.calculationSolutionId) state.calculationSolutionId = sid;
        }
      } else {
        state.selectedSolutions = state.selectedSolutions.filter(function(s) { return s.id !== sid; });
        if (state.calculationSolutionId === sid) {
          state.calculationSolutionId = state.selectedSolutions.length ? state.selectedSolutions[0].id : null;
        }
      }
      saveState();
      renderCurrentStep();
    });
  });

  el.querySelectorAll('.video-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var videoId = btn.dataset.videoId;
      var fallback = btn.dataset.videoFallback || 'amr';
      var name = btn.dataset.solutionName;
      openVideoModal(videoId, name, fallback);
    });
  });

  el.querySelectorAll('.solution-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.closest('label')) return;
      var cb = card.querySelector('[data-compare]');
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  });

  var btnAI = el.querySelector('#btnAIRecommend');
  if (btnAI) {
    btnAI.addEventListener('click', function() {
      fetchAIRecommendations(el);
    });
  }

  var btnNext2 = el.querySelector('#btnNext2');
  var btnBack2 = el.querySelector('#btnBack2');
  var btnClear = el.querySelector('#btnClearCompare');
  if (btnNext2) btnNext2.addEventListener('click', function() { if (!btnNext2.disabled) navigateToStep(3); });
  if (btnBack2) btnBack2.addEventListener('click', function() { navigateToStep(1); });
  if (btnClear) btnClear.addEventListener('click', function() { state.selectedSolutions = []; state.calculationSolutionId = null; renderCurrentStep(); saveState(); });

  var btnNext2Sticky = el.querySelector('#btnNext2Sticky');
  if (btnNext2Sticky) btnNext2Sticky.addEventListener('click', function() { if (!btnNext2Sticky.disabled) navigateToStep(3); });
  var btnScrollCompare = el.querySelector('#btnScrollCompare');
  if (btnScrollCompare) btnScrollCompare.addEventListener('click', function() {
    var target = document.getElementById('comparePanel');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Восстанавливаем открытую панель ИИ-рекомендаций после перерисовки
  bindAIRecsPanel(el);
}

/* -------------------- Шаг 3: расчёт + конфигуратор ----------------------- */

function renderStep3(el) {
  if (!state.selectedIndustry || !state.selectedObjectType) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">!</div><div class="empty-state-text">Сначала выберите объект на шаге 1.</div><button class="btn btn-primary" id="btnGoBack3">Перейти к шагу 1</button></div>';
    var btn = el.querySelector('#btnGoBack3');
    if (btn) btn.addEventListener('click', function() { navigateToStep(1); });
    return;
  }
  if (!state.selectedSolutions.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">~</div><div class="empty-state-text">Сначала выберите решения для сравнения на шаге 2.</div><button class="btn btn-primary" id="btnGoBack3b">Перейти к шагу 2</button></div>';
    var btn = el.querySelector('#btnGoBack3b');
    if (btn) btn.addEventListener('click', function() { navigateToStep(2); });
    return;
  }

  var ind = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
  var objType = ind ? (ind.objectTypes || []).find(function(t) { return t.id === state.selectedObjectType; }) : null;
  if (!objType) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Ошибка: тип объекта не найден.</div></div>'; return; }

  var params = state.customParams;
  var defaults = objType.defaults || {};

  var paramFields = [
    { key: 'area', label: 'Площадь объекта (м²)', min: 0, step: 100 },
    { key: 'operations', label: 'Объём операций в год', min: 0, step: 100 },
    { key: 'staff', label: 'Численность персонала', min: 0, step: 1 },
    { key: 'salary', label: 'Средняя зарплата (₽/мес.)', min: 0, step: 1000 },
    { key: 'shifts', label: 'Количество смен', min: 1, step: 1 },
    { key: 'workingDays', label: 'Рабочих дней в году', min: 0, step: 1 },
    { key: 'electricity', label: 'Эксплуатация здания (₽/м²/мес.)', min: 0, step: 0.5 },
    { key: 'energyTariff', label: 'Тариф электроэнергии (₽/кВт·ч)', min: 0, step: 0.1 },
    { key: 'avgWeight', label: 'Средний вес груза (кг)', min: 0, step: 1 },
    { key: 'storageHeight', label: 'Высота хранения (м)', min: 0, step: 1 },
  ];

  var infraFields = [
    { key: 'floorFlatness', label: 'Ровность пола (мм)', min: 0, step: 0.1, hint: 'Отклонение от плоскости, влияет на проходимость роботов' },
    { key: 'noiseLevelDb', label: 'Уровень шума (дБ)', min: 0, step: 1, hint: 'Если ниже 40 дБ, роботы требуют особого режима' },
    { key: 'chargingPowerKw', label: 'Мощность зарядки (кВт)', min: 0, step: 0.5, hint: 'Доступная мощность для зарядных станций' },
    { key: 'corridorWidth', label: 'Ширина проходов (м)', min: 0, step: 0.1, hint: 'Минимальная ширина прохода между стеллажами' },
  ];

  var loanFields = [
    { key: 'loanInterestRate', label: 'Ставка по кредиту (%/год)', min: 0, step: 0.1 },
    { key: 'loanTermYears', label: 'Срок кредита (лет)', min: 1, step: 1 },
    { key: 'loanDownPaymentRatio', label: 'Первоначальный взнос (%)', min: 0, max: 100, step: 5 },
  ];

  var economicDefaults = {
    horizon: 5,
    depreciationYears: 5,
    discountRate: 10,
    robotAvailability: 95,
    robotUtilization: 85,
  };

  var economicParams = [
    { key: 'horizon', label: 'Горизонт расчёта (лет)', min: 1, max: 20, step: 1 },
    { key: 'depreciationYears', label: 'Срок амортизации (лет)', min: 1, max: 20, step: 1 },
    { key: 'discountRate', label: 'Дисконтная ставка (%)', min: 0, step: 0.5 },
    { key: 'robotAvailability', label: 'Доступность робота (%)', min: 0, max: 100, step: 1, hint: 'Процент рабочего времени, например 90' },
    { key: 'robotUtilization', label: 'Загрузка робота (%)', min: 0, max: 100, step: 1, hint: 'Процент полезной нагрузки, например 55 для медицины' },
  ];

  var ratioFields = [
    { key: 'infrastructureRatio', label: 'Инфраструктура (доля CAPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'softwareRatio', label: 'ПО (доля CAPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'integrationRatio', label: 'Интеграция (доля CAPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'trainingRatio', label: 'Обучение (доля CAPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'reserveRatio', label: 'Резерв (доля CAPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'serviceRatio', label: 'Сервис (доля OPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'licenseRatio', label: 'Лицензии (доля OPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'materialRatio', label: 'Материалы (доля OPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'repairRatio', label: 'Ремонт (доля OPEX)', min: 0, max: 1, step: 0.01 },
    { key: 'managementRatio', label: 'Управление (доля OPEX)', min: 0, max: 1, step: 0.01 },
  ];

  var html = '<h2 class="section-title">Параметры объекта и расчёт экономики</h2>';
  html += '<p class="section-desc">Параметры предзаполнены данными для &ldquo;' + objType.name + '&rdquo;. Измените значения и результаты рассчитаются автоматически.</p>';

  html += '<div class="form-row" id="paramFields">';
  paramFields.forEach(function(pf) {
    var val = params[pf.key] !== undefined ? params[pf.key] : (defaults[pf.key] !== undefined ? defaults[pf.key] : pf.key === 'energyTariff' ? 6.5 : 0);
    html += '<div class="form-group"><label class="form-label" for="param_' + pf.key + '">' + pf.label + '</label>';
    html += '<input type="number" class="form-input" id="param_' + pf.key + '" data-param="' + pf.key + '" value="' + val + '" min="' + pf.min + '" step="' + (pf.step || 1) + '">';
    if (pf.hint) html += '<div class="form-hint">' + pf.hint + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="panel" style="margin-top:24px">';
  html += '<div class="panel-title">Инфраструктурные параметры</div>';
  html += '<p class="section-desc" style="margin-bottom:16px">Параметры объекта, влияющие на применимость и эффективность роботизированных решений.</p>';
  html += '<div class="form-row" id="infraFields">';
  infraFields.forEach(function(pf) {
    var val = params[pf.key] !== undefined ? params[pf.key] : (defaults[pf.key] !== undefined ? defaults[pf.key] : pf.key === 'energyTariff' ? 6.5 : 0);
    html += '<div class="form-group"><label class="form-label" for="param_' + pf.key + '">' + pf.label + '</label>';
    html += '<input type="number" class="form-input" id="param_' + pf.key + '" data-param="' + pf.key + '" value="' + val + '" min="' + (pf.min || 0) + '" step="' + (pf.step || 1) + '">';
    if (pf.hint) html += '<div class="form-hint">' + pf.hint + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';

  html += '<div class="panel" style="margin-top:24px">';
  html += '<div class="panel-title">Финансовые параметры модели</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px">';

  html += '<div style="flex:1;min-width:200px"><div class="form-label">Покупка</div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  economicParams.forEach(function(pf) {
    var val = params[pf.key] !== undefined ? params[pf.key] : (economicDefaults[pf.key] || 0);
    html += '<div class="form-group" style="min-width:140px;flex:1"><label class="form-label" for="param_' + pf.key + '">' + pf.label + '</label>';
    html += '<input type="number" class="form-input" id="param_' + pf.key + '" data-param="' + pf.key + '" value="' + val + '" min="' + (pf.min || 0) + '" max="' + (pf.max || 100) + '" step="' + (pf.step || 1) + '">';
    html += '</div>';
  });
  html += '</div></div>';

  html += '<div style="flex:1;min-width:200px"><div class="form-label">Кредит (заёмные средства)</div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  loanFields.forEach(function(pf) {
    var defVal = pf.key === 'loanInterestRate' ? 12 : pf.key === 'loanTermYears' ? 5 : 20;
    var val = params[pf.key] !== undefined ? params[pf.key] : defVal;
    html += '<div class="form-group" style="min-width:140px;flex:1"><label class="form-label" for="param_' + pf.key + '">' + pf.label + '</label>';
    html += '<input type="number" class="form-input" id="param_' + pf.key + '" data-param="' + pf.key + '" value="' + val + '" min="' + (pf.min || 0) + '" max="' + (pf.max || 100) + '" step="' + (pf.step || 1) + '">';
    html += '</div>';
  });
  html += '</div></div>';

  html += '</div>';
  html += '</div>';

  html += '<div class="panel" style="margin-top:24px" id="modelConfigPanel">';
  html += '<div class="panel-title">⚙️ Конфигуратор математической модели</div>';
  html += '<p class="section-desc" style="margin-bottom:16px">Тонкая настройка коэффициентов модели. Изменения сразу влияют на расчёт. Можно также попросить чат-помощника ниже адаптировать модель под вашу ситуацию.</p>';
  html += '<div class="model-ratio-grid">';
  ratioFields.forEach(function(pf) {
    var defVal = MODEL_RATIO_DEFAULTS[pf.key] !== undefined ? MODEL_RATIO_DEFAULTS[pf.key] : 0.05;
    var val = params[pf.key] !== undefined ? params[pf.key] : defVal;
    html += '<div class="form-group" style="margin-bottom:12px"><label class="form-label" for="param_' + pf.key + '">' + pf.label + '</label>';
    html += '<input type="number" class="form-input" id="param_' + pf.key + '" data-param="' + pf.key + '" value="' + val + '" min="' + (pf.min || 0) + '" max="' + (pf.max || 1) + '" step="' + (pf.step || 0.01) + '">';
    html += '</div>';
  });
  html += '</div>';
  html += '<button class="btn btn-sm btn-secondary" id="btnResetModelRatios">Сбросить к стандартным</button>';
  html += '</div>';

  html += '<div class="panel" style="margin-top:24px" id="modelChatPanel">';
  html += '<div class="panel-title">🤖 Чат-помощник по математической модели</div>';
  html += '<div id="modelChat"></div>';
  html += '</div>';

  html += '<div class="panel" style="margin-top:24px">';
  html += '<div class="panel-title">Решение для расчёта</div>';
  html += '<p class="section-desc" style="margin-bottom:16px">Сравнение сохраняется, а экономическая модель строится для одного выбранного сценария.</p>';
  html += '<div class="solution-selector">';
  var activeSolution = getCalculationSolution();
  state.selectedSolutions.forEach(function(s) {
    var selected = activeSolution && activeSolution.id === s.id;
    html += '<button type="button" class="solution-choice' + (selected ? ' selected' : '') + '" data-calc-solution="' + s.id + '">';
    html += '<span class="solution-choice-name">' + escapeHTML(s.name || '') + '</span>';
    html += '<span class="solution-choice-meta">' + escapeHTML(getSolutionTypeName(s.type)) + ' &middot; ' + escapeHTML(s.vendor || '') + '</span>';
    html += '<span class="solution-choice-fit">' + formatMetricValue('fit', s.fit) + '</span>';
    html += '</button>';
  });
  html += '</div>';
  html += '</div>';

  html += '<div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">';
  html += '<span class="form-label" style="margin-bottom:0">Параметры модели:</span>';
  html += '<input type="file" id="paramFile" accept=".csv,text/csv" style="display:none">';
  html += '<button class="btn btn-sm btn-secondary" id="btnUploadParams">Импорт CSV</button>';
  html += '<button class="btn btn-sm btn-secondary" id="btnTemplateParams">Шаблон CSV</button>';
  html += '</div>';

  html += '<div class="results-panel" id="resultsPanel">';
  html += '<div class="panel-title">Результаты расчёта</div>';
  html += buildResultsHTML();
  html += '</div>';

  html += '<div class="panel" style="margin-top:24px" id="whatIfPanel">';
  html += '<div class="panel-title">Анализ чувствительности (What-if)</div>';
  html += '<p class="section-desc" style="margin-bottom:16px">Показывает, как изменяется результат при варьировании ключевых параметров на ±10% и ±20%.</p>';
  html += buildWhatIfHTML();
  html += '</div>';

  html += '<div class="btn-group" style="margin-top:24px">';
  html += '<button class="btn btn-secondary" id="btnBack3">Назад</button>';
  html += '<button class="btn btn-primary" id="btnNext3">Далее: Формальные результаты</button>';
  html += '<button class="btn btn-success" id="btnExport3">Экспортировать расчёт</button>';
  html += '</div>';

  el.innerHTML = html;

  el.querySelectorAll('[data-param]').forEach(function(input) {
    input.addEventListener('input', function(e) {
      var key = e.target.dataset.param;
      var val = validateNumberInput(e.target.value);
      state.customParams[key] = val;
      updateResultsOnly(el);
      saveState();
    });
    input.addEventListener('blur', function(e) {
      var key = e.target.dataset.param;
      var val = validateNumberInput(e.target.value);
      state.customParams[key] = val;
      e.target.value = val;
      updateResultsOnly(el);
      saveState();
    });
  });

  el.querySelectorAll('[data-calc-solution]').forEach(function(button) {
    button.addEventListener('click', function() {
      state.calculationSolutionId = button.dataset.calcSolution;
      renderCurrentStep();
      saveState();
    });
  });

  var btnBack3 = el.querySelector('#btnBack3');
  var btnNext3 = el.querySelector('#btnNext3');
  var btnExport3 = el.querySelector('#btnExport3');
  if (btnBack3) btnBack3.addEventListener('click', function() { navigateToStep(2); });
  if (btnNext3) btnNext3.addEventListener('click', function() { navigateToStep(4); });
  if (btnExport3) btnExport3.addEventListener('click', function() { exportCalculation(); });

  var btnResetRatios = el.querySelector('#btnResetModelRatios');
  if (btnResetRatios) {
    btnResetRatios.addEventListener('click', function() {
      var ratioKeys = Object.keys(MODEL_RATIO_DEFAULTS);
      ratioKeys.forEach(function(k) { delete state.customParams[k]; });
      renderCurrentStep();
      saveState();
      showToast('Коэффициенты модели сброшены к стандартным', 'success');
    });
  }

  var btnUpload = el.querySelector('#btnUploadParams');
  var btnTemplate = el.querySelector('#btnTemplateParams');
  var fileInput = el.querySelector('#paramFile');
  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function() {
        try {
          importParamsCsv(String(reader.result || ''));
          updateResultsOnly(el);
          renderCurrentStep();
          showToast('Параметры импортированы из CSV', 'success');
        } catch(error) {
          showToast('Не удалось прочитать CSV-файл', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }
  if (btnTemplate) {
    btnTemplate.addEventListener('click', function() {
      downloadTemplateCsv();
      showToast('Шаблон CSV сформирован', 'success');
    });
  }

  try {
    renderModelChat(el);
  } catch (e) {
    console.warn('Model chat render failed:', e);
  }
}

/* -------------------- Шаг 4: формальные результаты ----------------------- */

function summaryItem(label, value) {
  return '<div class="result-item"><div class="result-label">' + label + '</div><div class="result-value" style="font-size:1rem">' + value + '</div></div>';
}

function buildAssumptionsHTML(results) {
  var p = state.customParams;
  var purchase = results.purchaseScenario || {};
  var assumptions = purchase.assumptions || {};
  var rows = [
    ['Горизонт расчёта', safeFloat(p.horizon, 5) + ' лет'],
    ['Срок амортизации', safeFloat(p.depreciationYears, 5) + ' лет'],
    ['Дисконтная ставка', safeFloat(p.discountRate, 10) + ' %'],
    ['Доступность робота', assumptions.availability != null ? formatNum(assumptions.availability * 100, 1) + ' %' : '—'],
    ['Загрузка робота', assumptions.utilization != null ? formatNum(assumptions.utilization * 100, 1) + ' %' : '—'],
    ['Коэфф. инфраструктуры', safeFloat(p.infrastructureRatio, 0.15).toFixed(2)],
    ['Коэфф. ПО', safeFloat(p.softwareRatio, 0.10).toFixed(2)],
    ['Коэфф. интеграции', safeFloat(p.integrationRatio, 0.15).toFixed(2)],
    ['Коэфф. обучения', safeFloat(p.trainingRatio, 0.05).toFixed(2)],
    ['Коэфф. резерва', safeFloat(p.reserveRatio, 0.10).toFixed(2)],
    ['Коэфф. сервиса (OPEX)', safeFloat(p.serviceRatio, 0.10).toFixed(2)],
    ['Коэфф. лицензий (OPEX)', safeFloat(p.licenseRatio, 0.05).toFixed(2)]
  ];
  var html = '<table class="compare-table" style="min-width:auto"><tbody>';
  rows.forEach(function(r) {
    html += '<tr><td style="text-align:left">' + r[0] + '</td><td style="text-align:right;font-weight:600">' + r[1] + '</td></tr>';
  });
  html += '</tbody></table>';
  return html;
}

function renderStep4(el) {
  if (!state.selectedIndustry || !state.selectedObjectType) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">!</div><div class="empty-state-text">Сначала завершите шаги 1-3.</div><button class="btn btn-primary" id="btnGoBack4">Перейти к шагу 1</button></div>';
    var btn = el.querySelector('#btnGoBack4');
    if (btn) btn.addEventListener('click', function() { navigateToStep(1); });
    return;
  }
  if (!state.selectedSolutions.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">~</div><div class="empty-state-text">Сначала выберите решения на шаге 2.</div><button class="btn btn-primary" id="btnGoBack4b">Перейти к шагу 2</button></div>';
    var btn = el.querySelector('#btnGoBack4b');
    if (btn) btn.addEventListener('click', function() { navigateToStep(2); });
    return;
  }

  var results = calculateEconomics();
  var ind = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
  var indName = ind ? ind.name : '';
  var objType = ind ? (ind.objectTypes || []).find(function(t) { return t.id === state.selectedObjectType; }) : null;
  var objTypeName = objType ? objType.name : (state.customObjectName || 'Произвольный объект');
  var activeSolution = getCalculationSolution() || {};

  var html = '<h2 class="section-title">📋 Формальные результаты</h2>';
  html += '<p class="section-desc">Итоговый отчёт по предварительной оценке роботизации объекта &ldquo;' + escapeHTML(getObjectTypeName()) + '&rdquo;. Данные можно экспортировать или распечатать.</p>';

  html += '<div class="results-panel" style="margin-top:0">';
  html += '<div class="panel-title">Резюме проекта</div>';
  html += '<div class="summary-grid">';
  html += summaryItem('Отрасль', escapeHTML(indName));
  html += summaryItem('Тип объекта', escapeHTML(objTypeName));
  html += summaryItem('Решений выбрано', state.selectedSolutions.length + ' шт.');
  html += summaryItem('Основное решение', escapeHTML(activeSolution.name || '—'));
  html += summaryItem('Вендор', escapeHTML(activeSolution.vendor || '—'));
  html += summaryItem('Дата', new Date().toLocaleDateString('ru-RU'));
  html += '</div></div>';

  html += '<div class="results-panel">';
  html += '<div class="panel-title">Ключевые показатели</div>';
  html += buildResultsHTML();
  html += '</div>';

  html += '<div class="results-panel">';
  html += '<div class="panel-title">Сравнение сценариев</div>';
  html += buildScenarioComparisonTable(results);
  html += '</div>';

  html += buildCapexBreakdown(results.purchaseScenario);

  html += '<div class="panel" style="margin-top:24px">';
  html += '<div class="panel-title">Допущения и параметры модели</div>';
  html += buildAssumptionsHTML(results);
  html += '</div>';

  if (results.warning) {
    html += '<div style="margin-top:16px;padding:12px 16px;background:var(--color-warning-bg);border-radius:var(--radius-sm);color:var(--color-warning);font-size:0.8125rem;font-weight:600">' + escapeHTML(results.warning) + '</div>';
  }

  html += '<div class="btn-group" style="margin-top:24px">';
  html += '<button class="btn btn-secondary" id="btnBack4">← Назад к расчёту</button>';
  html += '<button class="btn btn-success" id="btnExport4">Экспортировать расчёт</button>';
  html += '<button class="btn btn-primary" id="btnPrint4">🖨 Печать / PDF</button>';
  html += '</div>';

  el.innerHTML = html;

  var btnBack = el.querySelector('#btnBack4');
  var btnExport = el.querySelector('#btnExport4');
  var btnPrint = el.querySelector('#btnPrint4');
  if (btnBack) btnBack.addEventListener('click', function() { navigateToStep(3); });
  if (btnExport) btnExport.addEventListener('click', function() { exportCalculation(); });
  if (btnPrint) btnPrint.addEventListener('click', function() { window.print(); });
}

/* -------------------- Скролл при переходе между шагами ------------------- */

function navigateToStep(n) {
  if (n < 1 || n > 4) return;
  state.currentStep = n;
  document.querySelectorAll('.step').forEach(function(el) {
    var s = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (s < n) el.classList.add('completed');
    if (s === n) el.classList.add('active');
  });
  if (state.vizAnimFrame) {
    cancelAnimationFrame(state.vizAnimFrame);
    state.vizAnimFrame = null;
  }
  if (typeof dispose3D === 'function') dispose3D();
  renderCurrentStep();
  saveState();
  // Гарантируем, что пользователь всегда оказывается вверху новой страницы
  setTimeout(function() {
    window.scrollTo(0, 0);
  }, 30);
}

/* -------------------- Инициализация переопределённых рендеров ------------- */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    renderCurrentStep();
  });
} else {
  renderCurrentStep();
}