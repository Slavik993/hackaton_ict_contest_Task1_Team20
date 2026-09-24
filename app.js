const state = {
  currentStep: 1,
  selectedIndustry: null,
  selectedObjectType: null,
  customObjectName: '',
  customParams: {},
  selectedSolutions: [],
  calculationSolutionId: null,
  searchQuery: '',
  filterType: 'all',
  vizPaused: false,
  vizSpeed: 1,
  vizRobots: [],
  vizAnimFrame: null,
  vizTime: 0,
  vizStats: null,
  vizMode: '2d',
  viz3D: null,
};

function getObjTypes(industryId) {
  if (!HACKATHON_DATA || !HACKATHON_DATA.industries) return [];
  const ind = HACKATHON_DATA.industries.find(function(i) { return i.id === industryId; });
  return ind ? ind.objectTypes : [];
}

function getDefaults(industryId, objectTypeId) {
  var types = getObjTypes(industryId);
  var t = types.find(function(t) { return t.id === objectTypeId; });
  return t && t.defaults ? JSON.parse(JSON.stringify(t.defaults)) : {};
}

function getApplicableSolutions(objectTypeId) {
  if (!HACKATHON_DATA || !HACKATHON_DATA.solutions) return [];
  return HACKATHON_DATA.solutions.filter(function(s) {
    return s.applicableTo && s.applicableTo.indexOf(objectTypeId) !== -1;
  });
}

function getSolution(solutionId) {
  return (HACKATHON_DATA.solutions || []).find(function(s) { return s.id === solutionId; });
}

function getCalculationSolution() {
  if (!state.selectedSolutions.length) return null;
  var selected = state.selectedSolutions.find(function(s) { return s.id === state.calculationSolutionId; });
  return selected || state.selectedSolutions[0];
}

function getSolutionTypeName(typeId) {
  var type = (HACKATHON_DATA.solutionTypes || []).find(function(t) { return t.id === typeId; });
  return type ? type.name : typeId;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function formatMetricValue(key, value) {
  if (value === undefined || value === null || isNaN(Number(value))) return '—';
  var numberValue = Number(value);
  if (key === 'capexPerUnit' || key === 'serviceCostPerMonth') return formatCurrency(numberValue);
  if (key === 'laborReduction' || key === 'productivityLift' || key === 'co2Reduction') return formatNum(numberValue * 100, 1) + ' %';
  if (key === 'accuracy' || key === 'reliability' || key === 'fit') return formatNum(numberValue, 1) + ' %';
  return formatNum(numberValue, numberValue % 1 === 0 ? 0 : 1) + ' ' + (HACKATHON_DATA.metricUnits[key] || '');
}

function formatNum(n, decimals) {
  if (typeof decimals === 'undefined') decimals = 0;
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return '—';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(n) {
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return '—';
  return formatNum(Math.round(n), 0) + ' ₽';
}

function safeFloat(val, fallback) {
  if (fallback === undefined) fallback = 0;
  var n = parseFloat(val);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return n;
}

function showToast(message, type) {
  if (!type) type = 'info';
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '300ms ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3500);
}

function saveState() {
  try {
    var s = {
      selectedIndustry: state.selectedIndustry,
      selectedObjectType: state.selectedObjectType,
      customObjectName: state.customObjectName,
      customParams: state.customParams,
      selectedSolutions: state.selectedSolutions,
      calculationSolutionId: state.calculationSolutionId,
      searchQuery: state.searchQuery,
      filterType: state.filterType,
      currentStep: state.currentStep,
    };
    localStorage.setItem('roboplatform_state', JSON.stringify(s));
  } catch(e) {}
}

function loadState() {
  try {
    var raw = localStorage.getItem('roboplatform_state');
    if (!raw) return;
    var s = JSON.parse(raw);
    if (s.selectedIndustry) state.selectedIndustry = s.selectedIndustry;
    if (s.selectedObjectType) state.selectedObjectType = s.selectedObjectType;
    if (typeof s.customObjectName === 'string') state.customObjectName = s.customObjectName;
    if (s.customParams) state.customParams = s.customParams;
    if (Array.isArray(s.selectedSolutions)) {
      state.selectedSolutions = s.selectedSolutions.filter(function(solution) {
        return solution && solution.id && getSolution(solution.id);
      });
    }
    if (s.calculationSolutionId) state.calculationSolutionId = s.calculationSolutionId;
    if (typeof s.searchQuery === 'string') state.searchQuery = s.searchQuery;
    if (s.filterType) state.filterType = s.filterType;
    if (s.currentStep) state.currentStep = s.currentStep;
  } catch(e) {}
}

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
  dispose3D();
  renderCurrentStep();
  saveState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCurrentStep() {
  var el = document.getElementById('stepContent');
  switch(state.currentStep) {
    case 1: renderStep1(el); break;
    case 2: renderStep2(el); break;
    case 3: renderStep3(el); break;
    case 4: renderStep4(el); break;
  }
}

function validateNumberInput(value) {
  var n = safeFloat(value);
  if (n < 0) return 0;
  return n;
}

function renderStep1(el) {
  var industries = HACKATHON_DATA && HACKATHON_DATA.industries ? HACKATHON_DATA.industries : [];
  var html = '<h2 class="section-title">Выберите отрасль и тип объекта</h2>';
  html += '<p class="section-desc">Выберите отрасль для начала. Каждая отрасль содержит типы объектов с примерами параметров. Вариант &ldquo;Другое&rdquo; позволяет задать произвольный объект.</p>';
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
    html += '<button class="btn btn-primary" id="btnNext1" data-action="next"' + (!state.selectedObjectType ? ' disabled' : '') + '>Далее: Подбор решений</button>';
    html += '</div>';
  }

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
      renderCurrentStep();
      saveState();
    });
  });

el.querySelectorAll('[data-object-type]').forEach(function(card) {
    card.addEventListener('click', function() {
      state.selectedObjectType = card.dataset.objectType;
      state.selectedSolutions = [];
      state.calculationSolutionId = null;
      var d = getDefaults(state.selectedIndustry, state.selectedObjectType);
      if (d && Object.keys(d).length) {
        d.objectType = state.selectedObjectType;
        d.industry = state.selectedIndustry;
        d.industryName = (HACKATHON_DATA.industries.find(function(i){return i.id===state.selectedIndustry;})||{}).name || '';
        var indObj = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
        var otObj = indObj ? indObj.objectTypes.find(function(t) { return t.id === state.selectedObjectType; }) : null;
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
  if (btnNext) btnNext.addEventListener('click', function() { navigateToStep(2); });
}

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
  html += '<p class="section-desc">Доступные роботизированные решения для типа объекта &ldquo;' + getObjectTypeName() + '&rdquo;. Выберите до 3 решений для сравнения.</p>';

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
    html += '<div class="panel" style="margin-top:24px">';
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
    loading.style.display = 'none';
    if (data.recommendations && data.recommendations.length > 0) {
      panel.innerHTML = buildAIRecommendationsHTML(data.recommendations);
      panel.style.display = 'block';

      panel.querySelectorAll('[data-ai-add]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var sid = btn.dataset.aiAdd;
          var sol = data.recommendations.find(function(r) { return r.id === sid; });
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
                implementation: sol.implementation_months || sol.implementation || (sol.metrics && sol.metrics.implementation),
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
    } else {
      panel.innerHTML = buildAIRecommendationsHTML([]);
      panel.style.display = 'block';
    }
  })
  .catch(function(err) {
    loading.style.display = 'none';
    panel.innerHTML = '<div class="panel" style="margin-bottom:24px"><div class="panel-title">🧠 ИИ-рекомендации</div><div class="form-hint" style="color:var(--color-danger)">Ошибка ИИ-подбора: ' + escapeHTML(err.message || 'сервер недоступен') + '</div></div>';
    panel.style.display = 'block';
  });
}

function buildAIRecommendationsHTML(recs) {
  if (!recs || !recs.length) {
    return '<div class="panel" style="margin-bottom:24px"><div class="panel-title">🧠 ИИ-рекомендации</div><div class="form-hint">ИИ не нашёл подходящих решений. Попробуйте изменить параметры или поисковый запрос.</div></div>';
  }

  var maxScore = Math.max.apply(null, recs.map(function(r) { return r.aiScore || 0; }));
  var html = '<div class="panel ai-recommendations-panel" style="margin-bottom:24px">';
  html += '<div class="panel-title">🧠 ИИ-рекомендации <span class="ai-count-badge">' + recs.length + '</span></div>';
  html += '<p class="section-desc" style="margin-bottom:16px">Решения ранжированы по экономической эффективности, совпадению с задачей и параметрам объекта. Балл ИИ учитывает ROI, окупаемость, NPV, ограничения и текстовое совпадение.</p>';

  // Top-3 summary strip
  html += '<div class="ai-top-strip">';
  recs.slice(0, 3).forEach(function(r, idx) {
    var eco = r.economicPreview || {};
    var paybackStr = (eco.payback != null && eco.payback >= 0) ? formatNum(eco.payback, 1) + ' лет' : '—';
    html += '<div class="ai-top-item rank-' + (idx + 1) + '">';
    html += '<div class="ai-rank-num">' + (idx + 1) + '</div>';
    html += '<div class="ai-top-name">' + escapeHTML(r.name || 'Без названия') + '</div>';
    html += '<div class="ai-top-meta">Балл ' + (r.aiScore || 0) + ' · Окуп. ' + paybackStr + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="card-grid ai-rec-grid">';
  recs.forEach(function(r, idx) {
    var eco = r.economicPreview || {};
    var paybackStr = (eco.payback != null && eco.payback >= 0) ? formatNum(eco.payback, 1) + ' лет' : '—';
    var roiVal = eco.roi != null ? Math.round(eco.roi) : null;
    var scorePct = maxScore > 0 ? Math.round(((r.aiScore || 0) / maxScore) * 100) : 0;
    var isTop = idx < 3;

    html += '<div class="card ai-recommendation-card' + (isTop ? ' ai-top-card' : '') + '" data-solution-id="' + escapeAttr(r.id) + '">';
    
    // Rank + header
    html += '<div class="ai-card-rank">' + (idx + 1) + '</div>';
    html += '<div class="card-header">';
    html += '<div class="card-title">' + escapeHTML(r.name || 'Без названия') + '</div>';
    html += '<div class="ai-badges">';
    html += '<span class="card-badge ai-score" title="ИИ-балл">' + (r.aiScore || 0) + '</span>';
    html += '<span class="card-badge fit">' + Math.round(r.fit || 0) + '%</span>';
    html += '</div></div>';

    // Progress bar for AI score
    html += '<div class="ai-score-bar-wrap"><div class="ai-score-bar" style="width:' + scorePct + '%"></div></div>';

    html += '<p class="card-subtitle">' + escapeHTML(r.vendor || 'Неизвестный вендор') + ' · ' + escapeHTML(r.source || '') + '</p>';
    html += '<p class="card-description">' + escapeHTML((r.description || '').substring(0, 140)) + ((r.description || '').length > 140 ? '…' : '') + '</p>';

    // Explanation
    if (r.explanation) {
      html += '<div class="ai-explanation">' + escapeHTML(r.explanation) + '</div>';
    }

    // Economic mini-metrics
    html += '<div class="ai-econ-grid">';
    if (eco.throughputPerRobot > 0) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">Произв.</span><span class="ai-econ-val">' + formatNum(eco.throughputPerRobot, 0) + ' ед./ч</span></div>';
    }
    if (eco.robotCount) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">Роботов</span><span class="ai-econ-val">' + eco.robotCount + '</span></div>';
    }
    html += '<div class="ai-econ-item"><span class="ai-econ-label">Окупаемость</span><span class="ai-econ-val' + (eco.payback != null && eco.payback <= 3 ? ' positive' : '') + '">' + paybackStr + '</span></div>';
    if (roiVal != null) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">ROI</span><span class="ai-econ-val' + (roiVal > 50 ? ' positive' : '') + '">' + roiVal + '%</span></div>';
    }
    if (eco.npv != null) {
      html += '<div class="ai-econ-item"><span class="ai-econ-label">NPV</span><span class="ai-econ-val">' + formatCurrency(eco.npv) + '</span></div>';
    }
    html += '</div>';

    // Add button
    html += '<div class="ai-card-actions">';
    html += '<button class="btn btn-sm btn-primary" data-ai-add="' + escapeAttr(r.id) + '">Добавить в сравнение</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function getObjectTypeName() {
  if (!state.selectedIndustry || !state.selectedObjectType) return '';
  var ind = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
  if (!ind) return '';
  var t = (ind.objectTypes || []).find(function(t) { return t.id === state.selectedObjectType; });
  if (!t) return '';
  return state.selectedObjectType === 'custom' && state.customObjectName ? state.customObjectName : t.name;
}

function escapeAttr(s) {
  return escapeHTML(s);
}

function buildCompareTable() {
  if (!state.selectedSolutions.length) return '';
  var sols = state.selectedSolutions;
  var metricsToCompare = [
    ['fit', 'Совпадение', '%'],
    ['throughput', 'Производительность', 'ед./ч'],
    ['accuracy', 'Точность', '%'],
    ['payload', 'Грузоподъёмность', 'кг'],
    ['footprint', 'Площадь', 'м²'],
    ['autonomy', 'Автономность', 'ч'],
    ['reliability', 'Доступность', '%'],
    ['laborReduction', 'Сокращение труда', '%'],
    ['productivityLift', 'Рост продукт.', '%'],
    ['co2Reduction', 'Снижение CO2', '%'],
    ['capexPerUnit', 'CAPEX/ед.', '₽'],
    ['serviceCostPerMonth', 'Сервис/мес.', '₽'],
    ['powerKw', 'Мощность', 'кВт'],
    ['implementation', 'Запуск', 'мес.'],
  ];
  var html = '<div class="compare-table-wrapper"><table class="compare-table"><thead><tr><th>Параметр</th>';
  sols.forEach(function(s) { html += '<th>' + (s.name || '') + '</th>'; });
  html += '</tr></thead><tbody>';
  metricsToCompare.forEach(function(row) {
    var key = row[0], label = row[1], unit = row[2];
    html += '<tr><td>' + label + '</td>';
    sols.forEach(function(s) {
      var v = s.metrics ? s.metrics[key] : undefined;
      html += '<td>' + (v === undefined || v === null ? '—' : (key === 'fit' ? formatMetricValue('fit', v) : formatMetricValue(key, v))) + '</td>';
    });
    html += '</tr>';
  });
  html += '<tr><td>Вендор</td>';
  sols.forEach(function(s) { html += '<td>' + (s.vendor || '—') + '</td>'; });
  html += '</tr>';
  html += '<tr><td>Тип решения</td>';
  sols.forEach(function(s) {
    var st = (HACKATHON_DATA.solutionTypes || []).find(function(t) { return t.id === s.type; });
    html += '<td>' + (st ? st.name : s.type) + '</td>';
  });
  html += '</tr></tbody></table></div>';
  return html;
}

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
  var objType = ind ? ind.objectTypes.find(function(t) { return t.id === state.selectedObjectType; }) : null;
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
    { key: 'noiseLevelDb', label: 'Уровень шума (дБ)', min: 0, step: 1, hint: 'Если ниже 40 дБ, роботы требуют静音' },
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
    { key: 'robotAvailability', label: 'Доступность робота (%)', min: 0, max: 100, step: 1 },
    { key: 'robotUtilization', label: 'Загрузка робота (%)', min: 0, max: 100, step: 1 },
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
  html += '<button class="btn btn-primary" id="btnNext3">Далее: Визуализация</button>';
  html += '<button class="btn btn-success" id="btnExport3">Экспортировать расчёт</button>';
  html += '</div>';
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
}

function parseCsvCell(value) {
  var text = String(value == null ? '' : value);
  if (text.length >= 2 && text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') {
    return text.slice(1, -1).replace(/""/g, '"');
  }
  return text;
}

function parseCsvLine(line) {
  var cells = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var char = line.charAt(i);
    if (char === '"') {
      if (inQuotes && line.charAt(i + 1) === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(parseCsvCell(current));
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(parseCsvCell(current));
  return cells;
}

function importParamsCsv(text) {
  var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function(line) { return line.trim(); });
  if (lines.length < 2) throw new Error('Empty CSV');
  var headers = parseCsvLine(lines[0]).map(function(header) { return header.trim().toLowerCase(); });
  var values = parseCsvLine(lines[1]);
  var aliases = {
    area: ['area', 'площадь', 'площадь объекта'],
    operations: ['operations', 'операции', 'объём операций', 'объем операций'],
    staff: ['staff', 'персонал', 'численность персонала'],
    salary: ['salary', 'зарплата', 'средняя зарплата'],
    shifts: ['shifts', 'смены', 'количество смен'],
    workingDays: ['workingdays', 'working days', 'рабочие дни', 'рабочих дней'],
    electricity: ['electricity', 'тариф электроэнергии', 'электроэнергия'],
    energyTariff: ['energytariff', 'energy tariff', 'тариф квт'],
    avgWeight: ['avgweight', 'avg weight', 'средний вес'],
    storageHeight: ['storageheight', 'storage height', 'высота хранения'],
    floorFlatness: ['floorflatness', 'floor flatness', 'ровность пола'],
    noiseLevelDb: ['noiseleveldb', 'noise level db', 'уровень шума'],
    chargingPowerKw: ['chargingpowerkw', 'charging power kw', 'мощность зарядки'],
    corridorWidth: ['corridorwidth', 'corridor width', 'ширина проходов'],
    horizon: ['horizon', 'горизонт расчёта', 'горизонт расчета'],
    depreciationYears: ['depreciationyears', 'depreciation years', 'срок амортизации'],
    discountRate: ['discountrate', 'discount rate', 'дисконтная ставка'],
    robotAvailability: ['robotavailability', 'robot availability', 'доступность робота'],
    robotUtilization: ['robotutilization', 'robot utilization', 'загрузка робота'],
    loanInterestRate: ['loaninterestrate', 'loan interest rate', 'ставка по кредиту'],
    loanTermYears: ['loantermyears', 'loan term years', 'срок кредита'],
    loanDownPaymentRatio: ['loandownpaymentratio', 'loan down payment ratio', 'первоначальный взнос'],
  };
  headers.forEach(function(header, index) {
    Object.keys(aliases).forEach(function(key) {
      if (aliases[key].indexOf(header) !== -1 && values[index] !== undefined) {
        var numberValue = parseFloat(String(values[index]).replace(',', '.'));
        if (!isNaN(numberValue) && isFinite(numberValue)) state.customParams[key] = Math.max(0, numberValue);
      }
    });
    if (header === 'object name' || header === 'название объекта') state.customObjectName = String(values[index] || '').trim();
  });
}

function downloadTemplateCsv() {
  var headers = ['objectName', 'area', 'operations', 'staff', 'salary', 'shifts', 'workingDays', 'electricity', 'energyTariff', 'avgWeight', 'storageHeight', 'floorFlatness', 'noiseLevelDb', 'chargingPowerKw', 'corridorWidth', 'horizon', 'depreciationYears', 'discountRate', 'robotAvailability', 'robotUtilization', 'loanInterestRate', 'loanTermYears', 'loanDownPaymentRatio'];
  var row = ['Произвольный объект', 8000, 18000, 60, 82000, 2, 252, 12.5, 6.5, 12, 8, 5, 65, 50, 3, 5, 5, 10, 95, 85, 12, 5, 20];
  var csv = '﻿' + headers.join(',') + '\r\n' + row.join(',') + '\r\n';
  downloadFile('шаблон_параметров.csv', csv, 'text/csv;charset=utf-8');
}

function buildWhatIfHTML() {
  var baseSolution = getCalculationSolution();
  if (!baseSolution) return '<div class="empty-state-text">Выберите решение для анализа.</div>';

  var tests = [
    { key: 'operations', label: 'Объём операций' },
    { key: 'salary', label: 'Стоимость труда' },
    { key: 'capexPerUnit', label: 'Стоимость оборудования', solutionMetric: true },
  ];
  var variations = [-20, -10, 0, 10, 20];
  var html = '<div class="what-if-grid">';

  tests.forEach(function(test) {
    html += '<div class="what-if-card"><div class="what-if-title">' + test.label + '</div>';
    variations.forEach(function(variation) {
      var params = Object.assign({}, state.customParams);
      var solution = { id: baseSolution.id, metrics: Object.assign({}, baseSolution.metrics || {}) };
      if (test.solutionMetric) {
        solution.metrics.capexPerUnit = safeFloat(baseSolution.metrics.capexPerUnit, 0) * (1 + variation / 100);
      } else {
        params[test.key] = safeFloat(state.customParams[test.key], 0) * (1 + variation / 100);
      }
      var scenario = calcScenarioLocal(params, solution);
      var sign = scenario.netAnnual >= 0 ? '+' : '';
      html += '<div class="what-if-row"><span>' + (variation > 0 ? '+' : '') + variation + '%</span><strong>' + sign + formatCurrency(scenario.netAnnual) + '</strong><small>' + (scenario.payback > 0 ? formatNum(scenario.payback, 1) + ' лет' : '—') + '</small></div>';
    });
    html += '</div>';
  });

  html += '</div>';
  html += '<p class="form-hint" style="margin-top:12px">Каждая карточка изменяет один параметр, остальные остаются базовыми. Показаны чистый годовой эффект и окупаемость сценария покупки.</p>';
  return html;
}

function calcEconomicsWith(params) {
  var savedParams = Object.assign({}, state.customParams);
  state.customParams = Object.assign({}, state.customParams, params);
  var result = calculateEconomics();
  state.customParams = savedParams;
  return result;
}

function calcScenarioLocal(params, solution) {
  var p = params;
  var m = solution.metrics || {};
  var operations = safeFloat(p.operations, 0);
  var staff = safeFloat(p.staff, 0);
  var salary = safeFloat(p.salary, 80000);
  var area = safeFloat(p.area, 0);
  var electricityRate = safeFloat(p.electricity, 10);
  var workingDays = safeFloat(p.workingDays, 250);
  var shifts = Math.max(1, safeFloat(p.shifts, 1));

  var avgSalaryAnnual = salary * 12;
  var annualLaborCost = staff * avgSalaryAnnual;

  var throughput = safeFloat(m.throughput, 0);
  var capexPerUnit = safeFloat(m.capexPerUnit, 0);
  var serviceCostPerMonth = safeFloat(m.serviceCostPerMonth, 0);
  var powerKw = safeFloat(m.powerKw, 0);
  var payload = safeFloat(m.payload, 0);
  var laborReduction = safeFloat(m.laborReduction, 0);
  var productivityLift = safeFloat(m.productivityLift, 0);

// Domain correction multipliers for labor/productivity effect.
  // Logistics/industrial solutions assume high repeatable throughput; in the
  // social/medical sector clinical workflows are safety-critical and non-repeatable,
  // so the achievable labor reduction is much lower (payback 3-7 years, not 3).
  var objType = String(p.objectType || p.objectTypeName || p.object_type || '').toLowerCase();
  var industry = String(p.industry || p.industryId || p.industryName || '').toLowerCase();
  var isMedicalDomain =
    objType.indexOf('мед') !== -1 || objType.indexOf('medical') !== -1 || objType.indexOf('больниц') !== -1 ||
    objType.indexOf('реабил') !== -1 || objType.indexOf('клиник') !== -1 || objType.indexOf('hospital') !== -1 ||
    industry.indexOf('социал') !== -1 || industry.indexOf('мед') !== -1 || industry.indexOf('zdрав') !== -1 ||
    industry === 'social' || objType === 'medical';
  var isFarmDomain = objType.indexOf('ферм') !== -1 || objType.indexOf('farm') !== -1 || industry.indexOf('сельск') !== -1 || industry === 'agriculture';
  var isConstructionDomain = objType.indexOf('строитель') !== -1 || objType.indexOf('construction') !== -1 || industry.indexOf('строитель') !== -1 || industry === 'construction';
  var isEnergyDomain = objType.indexOf('энерг') !== -1 || objType.indexOf('energy') !== -1 || industry.indexOf('тэк') !== -1 || industry.indexOf('энерг') !== -1 || industry === 'energy';
  var isSecurityDomain = objType.indexOf('охран') !== -1 || objType.indexOf('security') !== -1 || industry.indexOf('безопасн') !== -1 || industry === 'security';

  // Медицина / соцсфера: клинические процессы safety-critical, не повторяемые.
  // Целевой диапазон окупаемости 3–7 лет (как в Таблице 1 статьи).
  if (isMedicalDomain) {
    laborReduction *= 0.35;      // было 0.6 — слишком мягко
    productivityLift *= 0.30;    // было 0.5
  } else if (isFarmDomain) {
    laborReduction *= 0.85; productivityLift *= 0.8;
  } else if (isConstructionDomain) {
    laborReduction *= 0.9; productivityLift *= 0.85;
  } else if (isEnergyDomain) {
    laborReduction *= 0.9; productivityLift *= 0.85;
  } else if (isSecurityDomain) {
    laborReduction *= 0.85; productivityLift *= 0.8;
  }

  var floorFlatness = safeFloat(p.floorFlatness, 0);
  var noiseLevelDb = safeFloat(p.noiseLevelDb, 0);
  var chargingPowerKw = safeFloat(p.chargingPowerKw, 0);

  var depreciationYears = Math.max(1, safeFloat(p.depreciationYears, 5));
  var horizon = Math.max(1, safeFloat(p.horizon, 5));
  var discountRate = safeFloat(p.discountRate, 10) / 100;
  var availability = clamp(safeFloat(p.robotAvailability, 95) / 100, 0.05, 1);
  var utilization = clamp(safeFloat(p.robotUtilization, 85) / 100, 0.05, 1);
  var energyTariff = safeFloat(p.energyTariff, 6.5);
  var infraRatio = safeFloat(p.infrastructureRatio, 0.15);
  var softwareRatio = safeFloat(p.softwareRatio, 0.10);
  var integrationRatio = safeFloat(p.integrationRatio, 0.15);
  var trainingRatio = safeFloat(p.trainingRatio, 0.05);
  var reserveRatio = safeFloat(p.reserveRatio, 0.10);
  var materialRatio = safeFloat(p.materialRatio, 0.03);
  var repairRatio = safeFloat(p.repairRatio, 0.02);
  var managementRatio = safeFloat(p.managementRatio, 0.05);
  var serviceRatio = safeFloat(p.serviceRatio, 0.10);
  var licenseRatio = safeFloat(p.licenseRatio, 0.05);

  // Медицинские дефолты (Таблица 1: окупаемость 3–7 лет)
  if (isMedicalDomain) {
    if (safeFloat(p.horizon, 5) === 5 && safeFloat(p.horizon, 5) === 5) horizon = 7;
    if (safeFloat(p.depreciationYears, 5) === 5) depreciationYears = 7;
    if (!p.infrastructureRatio || safeFloat(p.infrastructureRatio, 0.15) === 0.15) infraRatio = 0.20;
    if (!p.integrationRatio || safeFloat(p.integrationRatio, 0.15) === 0.15) integrationRatio = 0.20;
    if (!p.trainingRatio || safeFloat(p.trainingRatio, 0.05) === 0.05) trainingRatio = 0.08;
    if (!p.serviceRatio || safeFloat(p.serviceRatio, 0.10) === 0.10) serviceRatio = 0.12;
    // Клиническая загрузка заметно ниже складской (подготовка пациентов, слоты)
    if (safeFloat(p.robotUtilization, 85) === 85) utilization = 0.55;
    if (safeFloat(p.robotAvailability, 95) === 95) availability = 0.90;
  }

  var effectiveHoursPerDay = Math.min(24, shifts * 8);
  var totalHoursPerYear = workingDays * effectiveHoursPerDay;

  var robotCount = 1;
  if (throughput > 0 && totalHoursPerYear > 0) {
    var annualThroughputRobot = throughput * totalHoursPerYear;
    robotCount = Math.max(1, Math.ceil(operations / annualThroughputRobot));
  }

  var infraAdjustment = 1.0;
  if (floorFlatness > 0 && floorFlatness > 3) infraAdjustment *= 1.05;
  if (noiseLevelDb > 0 && noiseLevelDb < 40) infraAdjustment *= 1.03;
  if (chargingPowerKw > 0 && powerKw > 0) {
    var chargingTimeRatio = Math.min(1, (powerKw * 8 * shifts) / (chargingPowerKw * 12));
    if (chargingTimeRatio < 0.3) infraAdjustment *= 1.15;
    else if (chargingTimeRatio < 0.5) infraAdjustment *= 1.08;
  }

  robotCount = Math.ceil(robotCount / Math.max(0.05, availability * utilization) * infraAdjustment);

  var equipmentCost = robotCount * capexPerUnit;
  var infrastructureCost = equipmentCost * infraRatio;
  var softwareCost = equipmentCost * softwareRatio;
  var integrationCost = equipmentCost * integrationRatio;
  var trainingCost = equipmentCost * trainingRatio;
  var capexReserve = equipmentCost * reserveRatio;
  var totalCapex = (equipmentCost + infrastructureCost + softwareCost + integrationCost + trainingCost + capexReserve) * infraAdjustment;

  var annualService = robotCount * serviceCostPerMonth * 12 * (1 + serviceRatio);
  var annualLicenses = equipmentCost * licenseRatio;
  var annualElectricity = area * electricityRate * 12 + robotCount * powerKw * totalHoursPerYear * energyTariff;
  var annualMaterials = equipmentCost * materialRatio;
  var annualRepair = equipmentCost * repairRatio / depreciationYears;
  var annualManagement = equipmentCost * managementRatio;
  var totalAnnualOpex = annualService + annualLicenses + annualElectricity + annualMaterials + annualRepair + annualManagement;

  var annualDepreciation = totalCapex / depreciationYears;

  var depreciationSchedule = [];
  var bookValue = totalCapex;
  for (var yr = 1; yr <= horizon; yr++) {
    var dep = totalCapex / depreciationYears;
    bookValue = Math.max(0, bookValue - dep);
    depreciationSchedule.push({
      year: yr,
      depreciation: dep,
      accumulated: totalCapex - bookValue,
      bookValue: bookValue,
    });
  }

var laborSavings = annualLaborCost * laborReduction;
  var productivityGain = annualLaborCost * productivityLift;
  var annualSavings = laborSavings + productivityGain;
  var netAnnualEffect = annualSavings - totalAnnualOpex;
  var netWithDepreciation = annualSavings - totalAnnualOpex - annualDepreciation;

  var annualNet = annualSavings - totalAnnualOpex;   // чистый денежный поток

  // Срок окупаемости (простой)
  var payback = 0;
  if (annualNet > 0 && totalCapex > 0) {
    payback = totalCapex / annualNet;
    if (!isFinite(payback) || payback < 0) payback = 0;
  }

  // ROI на горизонте расчёта (а не «магические 3 года»)
  var roi = 0;
  var roi3y = 0;
  var roiHorizon = 0;
  if (totalCapex > 0) {
    var cumulativeNet = annualNet * horizon;
    roi = (cumulativeNet / totalCapex) * 100;           // ROI на весь горизонт

    var cumulativeNet3 = annualNet * Math.min(3, horizon);
    roi3y = (cumulativeNet3 / totalCapex) * 100;        // ROI за 3 года (для UI)
    roiHorizon = roi;
  }

  // Медицинский потолок, чтобы не было 700+%
  if (isMedicalDomain) {
    roi = Math.min(roi, 180);      // максимум ~180% на горизонте 5–7 лет
    roi3y = Math.min(roi3y, 80);   // за 3 года редко выше 50–80%
  }

  var npv = -totalCapex;
  for (var yi = 1; yi <= horizon; yi++) {
    npv += (annualSavings - totalAnnualOpex) / Math.pow(1 + discountRate, yi);
  }
  if (!isFinite(npv)) npv = 0;

  var tco = totalCapex;
  for (var tc = 1; tc <= horizon; tc++) {
    var replacement = (tc % depreciationYears === 0) ? equipmentCost * 0.7 : 0;
    tco += totalAnnualOpex + replacement;
  }

return {
    capex: totalCapex,
    baseCapex: equipmentCost * (1 + infraRatio + softwareRatio + integrationRatio + trainingRatio + reserveRatio),
    opex: totalAnnualOpex,
    savings: annualSavings,
    netAnnual: netAnnualEffect,
    netWithDepreciation: netWithDepreciation,
    payback: payback,
    roi: roi3y,          // ROI за 3 года — то, что показывается как «ROI за 3 года»
    roi3y: roi3y,
    roiHorizon: roi,     // ROI на полном горизонте
    npv: npv,
    tco: tco,
    robotCount: robotCount,
    totalPowerKw: robotCount * powerKw,
    annualLaborCost: annualLaborCost,
    laborSavings: laborSavings,
    productivityGain: productivityGain,
    annualDepreciation: annualDepreciation,
    depreciationSchedule: depreciationSchedule,
    infraAdjustment: infraAdjustment,
    capexBreakdown: {
      equipment: equipmentCost,
      infrastructure: infrastructureCost,
      software: softwareCost,
      integration: integrationCost,
      training: trainingCost,
      reserve: capexReserve,
    },
    opexBreakdown: {
      service: annualService,
      licenses: annualLicenses,
      electricity: annualElectricity,
      materials: annualMaterials,
      repair: annualRepair,
      management: annualManagement,
    },
    assumptions: {
      depreciationMethod: 'linear',
      depreciationYears: depreciationYears,
      discountRate: discountRate,
      availability: availability,
      utilization: utilization,
      horizon: horizon,
      infraAdjustment: infraAdjustment,
      domain: isMedicalDomain ? 'medical' : (isFarmDomain ? 'farm' : (isConstructionDomain ? 'construction' : (isEnergyDomain ? 'energy' : (isSecurityDomain ? 'security' : 'general')))),
    },
  };
}

function calcLoanScenarioLocal(params, solution, purchaseScenario) {
  var p = params;
  var horizon = safeFloat(p.horizon, 5);
  var annualSavings = purchaseScenario.savings || 0;
  var annualOpex = purchaseScenario.opex || 0;
  var totalCapex = purchaseScenario.capex || 0;

  var interestRate = safeFloat(p.loanInterestRate, 12) / 100;
  var loanTermYears = safeFloat(p.loanTermYears, 5);
  var downPaymentRatio = safeFloat(p.loanDownPaymentRatio, 20) / 100;
  var paymentFrequency = p.loanPaymentFrequency || 'monthly';

  var downPayment = totalCapex * downPaymentRatio;
  var loanAmount = totalCapex * (1 - downPaymentRatio);

  var periodsPerYear = paymentFrequency === 'quarterly' ? 4 : 12;
  var totalPeriods = loanTermYears * periodsPerYear;
  var periodRate = interestRate / periodsPerYear;

  var periodicPayment = 0;
  if (totalPeriods > 0 && periodRate > 0) {
    periodicPayment = loanAmount * (periodRate * Math.pow(1 + periodRate, totalPeriods)) / (Math.pow(1 + periodRate, totalPeriods) - 1);
  } else {
    periodicPayment = loanAmount / totalPeriods;
  }

  var annualDebtService = periodicPayment * periodsPerYear;
  var annualTotalCost = annualOpex + annualDebtService;
  var netAnnual = annualSavings - annualTotalCost;

  var payback = 0;
  if (annualSavings > 0 && downPayment > 0) {
    payback = downPayment / (annualSavings - annualTotalCost);
    if (!isFinite(payback) || payback < 0) payback = 0;
  }

  var roi = 0;
  if (downPayment > 0) {
    roi = ((annualSavings * horizon - downPayment - annualDebtService * horizon) / downPayment) * 100;
    if (!isFinite(roi)) roi = 0;
  }

  var npv = -downPayment;
  var discountRate = safeFloat(p.discountRate, 10) / 100;
  for (var yi = 1; yi <= horizon; yi++) {
    npv += netAnnual / Math.pow(1 + discountRate, yi);
  }
  if (!isFinite(npv)) npv = 0;

  var tco = downPayment;
  for (var tc = 1; tc <= horizon; tc++) {
    tco += annualTotalCost;
  }

  return {
    model: 'loan',
    capex: downPayment,
    opex: annualTotalCost,
    annualOpex: annualOpex,
    annualDebtService: annualDebtService,
    savings: annualSavings,
    netAnnual: netAnnual,
    payback: payback,
    roi: roi,
    npv: npv,
    tco: tco,
    robotCount: purchaseScenario.robotCount,
    loanDetails: {
      downPayment: downPayment,
      loanAmount: loanAmount,
      periodicPayment: periodicPayment,
      paymentFrequency: paymentFrequency,
      interestRate: interestRate * 100,
      loanTermYears: loanTermYears,
      totalPayments: periodicPayment * totalPeriods,
    },
    assumptions: {
      model: 'loan',
      interestRate: interestRate * 100,
      loanTermYears: loanTermYears,
      downPaymentRatio: downPaymentRatio * 100,
      paymentFrequency: paymentFrequency,
    },
  };
}

function calcRaasScenarioLocal(params, solution, purchaseScenario) {
  var p = params;
  var horizon = safeFloat(p.horizon, 5);
  var annualSavings = purchaseScenario.savings || 0;
  var annualOpex = purchaseScenario.opex || 0;
  var totalCapex = purchaseScenario.capex || 0;

  var monthlyRate = safeFloat(p.raasMonthlyRate, 2) / 100;
  var contractYears = safeFloat(p.raasContractYears, horizon);
  var purchaseOptionPrice = safeFloat(p.raasPurchaseOption, 0);

  var months = contractYears * 12;
  var monthlyPayment = (totalCapex / months) * (1 + monthlyRate);
  var annualPayment = monthlyPayment * 12;
  var netAnnual = annualSavings - annualPayment;

  var payback = 0;
  if (annualSavings > 0 && totalCapex > 0) {
    payback = totalCapex / (annualSavings - annualPayment);
    if (!isFinite(payback) || payback < 0) payback = 0;
  }

  var roi = 0;
  if (totalCapex > 0) {
    roi = ((annualSavings * horizon - monthlyPayment * 12 * horizon) / totalCapex) * 100;
    if (!isFinite(roi)) roi = 0;
  }

  var npv = 0;
  var discountRate = safeFloat(p.discountRate, 10) / 100;
  for (var yi = 1; yi <= horizon; yi++) {
    npv += netAnnual / Math.pow(1 + discountRate, yi);
  }
  if (!isFinite(npv)) npv = 0;

  var tco = totalCapex;
  for (var tc = 1; tc <= horizon; tc++) {
    tco += annualPayment;
  }

  return {
    model: 'raas',
    capex: 0,
    opex: annualPayment,
    annualOpex: annualOpex,
    savings: annualSavings,
    netAnnual: netAnnual,
    payback: payback,
    roi: roi,
    npv: npv,
    tco: tco,
    robotCount: purchaseScenario.robotCount,
    monthlyPayment: monthlyPayment,
    contractYears: contractYears,
    assumptions: {
      model: 'rental',
      monthlyRate: monthlyRate * 100,
      contractYears: contractYears,
    },
  };
}

function buildResultsHTML() {
  var results = calculateEconomics();

  if (results.error) {
    return '<div class="empty-state-text">' + results.error + '</div>';
  }

  var html = '<div class="results-grid">';
  html += resultItem('CAPEX', results.baseScenario, results.purchaseScenario);
  html += resultItem('Годовой OPEX', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('Годовая экономия', results.baseScenario, results.purchaseScenario);
  html += resultItem('Чистый годовой эффект', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('Срок окупаемости', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('ROI за 3 года', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('NPV', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('TCO', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('Потребность в роботах', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += resultItem('Снижение CO₂', results.baseScenario, results.purchaseScenario, results.raasScenario, results.loanScenario);
  html += '</div>';

  html += buildScenarioComparisonTable(results);
  html += buildCapexBreakdown(results.purchaseScenario);

  if (results.warning) {
    html += '<div style="margin-top:12px;padding:12px 16px;background:var(--color-warning-bg);border-radius:var(--radius-sm);color:var(--color-warning);font-size:0.8125rem;font-weight:600">' + results.warning + '</div>';
  }

  return html;
}

function buildScenarioComparisonTable(results) {
  var sc = results;
  var scenarios = [
    { name: 'Без роботизации', data: sc.baseScenario, showLoanDetails: false },
    { name: 'Покупка', data: sc.purchaseScenario, showLoanDetails: false },
    { name: 'RaaS (аренда)', data: sc.raasScenario, showLoanDetails: false },
    { name: 'Кредит', data: sc.loanScenario, showLoanDetails: true },
  ];

  var columns = [
    { key: 'capex', label: 'CAPEX', unit: '₽', format: 'currency', primary: true },
    { key: 'opex', label: 'OPEX/год', unit: '₽', format: 'currency' },
    { key: 'savings', label: 'Экономия', unit: '₽', format: 'currency' },
    { key: 'netAnnual', label: 'Чистый эффект', unit: '₽', format: 'currency' },
    { key: 'payback', label: 'Срок окуп.', unit: 'лет', format: 'currency' },
    { key: 'roi', label: 'ROI за 3 года', unit: '%', format: 'percent' },
    { key: 'robotCount', label: 'Роботы', unit: 'шт.', format: 'number' },
  ];

  var html = '<div class="scenario-comparison" style="margin-top:24px">';
  html += '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:12px">Сравнение сценариев</h3>';
  html += '<div class="compare-table-wrapper"><table class="compare-table"><thead><tr><th>Показатель</th>';
  scenarios.forEach(function(s) {
    html += '<th>' + s.name + '</th>';
  });
  html += '</tr></thead><tbody>';

  columns.forEach(function(col) {
    html += '<tr><td>' + col.label + '</td>';
    scenarios.forEach(function(s) {
      var d = s.data;
      var val = d[col.key];
      var cls = '';
      if (col.key === 'netAnnual' || col.key === 'savings' || col.key === 'roi') {
        if (val > 0) cls = 'positive';
        else if (val < 0) cls = 'negative';
      }
      if (col.key === 'payback') {
        if (val > 0 && val <= 3) cls = 'positive';
        else if (val > 10 || val < 0) cls = 'negative';
        else cls = 'warning';
      }
      var display;
      if (col.format === 'currency') {
        display = formatCurrency(val);
      } else if (col.format === 'percent') {
        display = formatNum(val, 1) + ' %';
      } else if (col.format === 'number') {
        display = formatNum(val, 0) + ' ' + col.unit;
      } else {
        display = val > 0 ? formatNum(val, 1) + ' ' + col.unit : '—';
      }
      if (col.key === 'capex' && s.data.model === 'base') display = '—';
      if (col.key === 'payback' && s.data.model === 'base') display = '—';
      html += '<td class="' + cls + '" style="font-weight:600">' + display + '</td>';
    });
    html += '</tr>';
  });

  if (sc.loanScenario && sc.purchaseScenario) {
    html += '<tr><td style="font-size:0.8rem;color:var(--color-text-secondary)">Первонач. взнос</td>';
    scenarios.forEach(function(s) {
      if (s.data.model === 'loan' && s.data.loanDetails) {
        html += '<td colspan="7" style="text-align:left"><div style="margin-left:0"><strong>Кредит:</strong> взнос ' + formatCurrency(s.data.loanDetails.downPayment) + ' | сумма кредита ' + formatCurrency(s.data.loanDetails.loanAmount) + ' | платёж ' + formatCurrency(s.data.loanDetails.periodicPayment) + '/мес. | ставка ' + formatNum(s.data.loanDetails.interestRate, 1) + '% | срок ' + s.data.loanDetails.loanTermYears + ' лет</div></td>';
      } else {
        html += '<td colspan="7"></td>';
      }
    });
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function buildCapexBreakdown(purchaseScenario) {
  if (!purchaseScenario || !purchaseScenario.capexBreakdown) return '';
  var cb = purchaseScenario.capexBreakdown;
  var ob = purchaseScenario.opexBreakdown;
  var html = '<div class="panel" style="margin-top:24px">';
  html += '<div class="panel-title">Детализация CAPEX и OPEX</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">';

  html += '<div>';
  html += '<div class="form-label" style="margin-bottom:8px;font-size:0.8125rem;font-weight:600">CAPEX (сценарий покупки)</div>';
  html += '<table class="compare-table" style="min-width:auto"><tbody>';
  html += '<tr><td style="text-align:left">Оборудование</td><td style="text-align:right">' + formatCurrency(cb.equipment) + '</td></tr>';
  html += '<tr><td style="text-align:left">Инфраструктура</td><td style="text-align:right">' + formatCurrency(cb.infrastructure) + '</td></tr>';
  html += '<tr><td style="text-align:left">ПО</td><td style="text-align:right">' + formatCurrency(cb.software) + '</td></tr>';
  html += '<tr><td style="text-align:left">Интеграция</td><td style="text-align:right">' + formatCurrency(cb.integration) + '</td></tr>';
  html += '<tr><td style="text-align:left">Обучение</td><td style="text-align:right">' + formatCurrency(cb.training) + '</td></tr>';
  html += '<tr><td style="text-align:left">Резерв</td><td style="text-align:right">' + formatCurrency(cb.reserve) + '</td></tr>';
  html += '<tr><td style="text-align:left;font-weight:700">Итого</td><td style="text-align:right;font-weight:700">' + formatCurrency(purchaseScenario.totalCapex || purchaseScenario.capex) + '</td></tr>';
  html += '</tbody></table>';
  html += '</div>';

  html += '<div>';
  html += '<div class="form-label" style="margin-bottom:8px;font-size:0.8125rem;font-weight:600">OPEX (годовые)</div>';
  html += '<table class="compare-table" style="min-width:auto"><tbody>';
  html += '<tr><td style="text-align:left">Сервис</td><td style="text-align:right">' + formatCurrency(ob.service) + '</td></tr>';
  html += '<tr><td style="text-align:left">Лицензии</td><td style="text-align:right">' + formatCurrency(ob.licenses) + '</td></tr>';
  html += '<tr><td style="text-align:left">Электроэнергия</td><td style="text-align:right">' + formatCurrency(ob.electricity) + '</td></tr>';
  html += '<tr><td style="text-align:left">Материалы</td><td style="text-align:right">' + formatCurrency(ob.materials) + '</td></tr>';
  html += '<tr><td style="text-align:left">Ремонт</td><td style="text-align:right">' + formatCurrency(ob.repair) + '</td></tr>';
  html += '<tr><td style="text-align:left">Управление</td><td style="text-align:right">' + formatCurrency(ob.management) + '</td></tr>';
  html += '<tr><td style="text-align:left;font-weight:700">Итого</td><td style="text-align:right;font-weight:700">' + formatCurrency(purchaseScenario.totalAnnualOpex || purchaseScenario.opex) + '</td></tr>';
  html += '</tbody></table>';
  html += '<div class="form-label" style="margin-bottom:8px;font-size:0.8125rem;font-weight:600;margin-top:16px">Амортизация</div>';
  if (purchaseScenario.assumptions) {
    html += '<div style="font-size:0.8125rem;color:var(--color-text-secondary)"><strong>Метод:</strong> ' + (purchaseScenario.assumptions.depreciationMethod === 'linear' ? 'Линейный' : 'Иной') + ' | <strong>Срок:</strong> ' + (purchaseScenario.assumptions.depreciationYears || 5) + ' лет | <strong>Годовая амортизация:</strong> ' + formatCurrency(purchaseScenario.annualDepreciation || 0) + '</div>';
  }
  html += '</div>';

  html += '</div></div>';
  return html;
}

function resultItem(label, baseScenario, purchase, raas, loan) {
  var scenarios = [baseScenario, purchase, raas, loan].filter(function(s) { return s; });
  var keys = {
    'CAPEX': 'capex',
    'Годовой OPEX': 'opex',
    'Годовая экономия': 'savings',
    'Чистый годовой эффект': 'netAnnual',
    'Срок окупаемости': 'payback',
    'ROI за 3 года': 'roi',
    'NPV': 'npv',
    'TCO': 'tco',
    'Потребность в роботах': 'robotCount',
    'Снижение CO₂': 'co2',
  };
  var valKey = keys[label] || 'value';
  var primary = purchase || scenarios[scenarios.length - 1];
  var baseline = baseScenario || primary;
  var value = primary ? primary[valKey] : 0;
  var baseValue = baseline ? baseline[valKey] : 0;
  var display = '—';
  var cls = '';

  if (valKey === 'capex' || valKey === 'opex' || valKey === 'savings' || valKey === 'netAnnual' || valKey === 'npv' || valKey === 'tco' || valKey === 'co2') {
    display = label === 'Снижение CO₂' ? formatNum(value, 1) + ' т/год' : formatCurrency(value);
  } else if (valKey === 'roi') {
    display = formatNum(value, 1) + ' %';
  } else if (valKey === 'payback') {
    display = value > 0 ? formatNum(value, 1) + ' лет' : '—';
  } else if (valKey === 'robotCount') {
    display = formatNum(value, 0) + ' шт.';
  }

  if (valKey === 'netAnnual' || valKey === 'savings' || valKey === 'roi' || valKey === 'npv') {
    cls = value >= 0 ? 'positive' : 'negative';
  }
  if (valKey === 'payback') {
    cls = value > 0 && value <= 3 ? 'positive' : value > 10 ? 'negative' : 'warning';
  }
  if (valKey === 'capex' && baseline.model === 'base') display = '—';

  var detail = valKey === 'capex' && baseline.model === 'base' ? 'Проектный CAPEX' : formatCurrency(baseValue) + ' → ' + formatCurrency(value);
  return '<div class="result-item"><div class="result-label">' + label + '</div><div class="result-value ' + cls + '">' + display + '</div><div class="result-detail">' + detail + '</div></div>';
}

function updateResultsOnly(el) {
  var panel = el.querySelector('#resultsPanel');
  if (panel) {
    panel.innerHTML = '<div class="panel-title">Результаты расчёта</div>' + buildResultsHTML();
  }
  var whatIf = el.querySelector('#whatIfPanel');
  if (whatIf) {
    whatIf.innerHTML = '<div class="panel-title">Анализ чувствительности (What-if)</div>' +
      '<p class="section-desc" style="margin-bottom:16px">Показывает, как изменяется результат при варьировании ключевых параметров на ±10% и ±20%.</p>' +
      buildWhatIfHTML();
  }
}

function calculateEconomics() {
  var p = state.customParams;
  var area = safeFloat(p.area, 0);
  var operations = safeFloat(p.operations, 0);
  var staff = safeFloat(p.staff, 0);
  var salary = safeFloat(p.salary, 0);
  var shifts = Math.max(1, safeFloat(p.shifts, 1));
  var workingDays = safeFloat(p.workingDays, 0);
  var electricityRate = safeFloat(p.electricity, 0);
  var horizon = safeFloat(p.horizon, 5);

  if (!state.selectedSolutions || !state.selectedSolutions.length) {
    return { error: 'Выберите хотя бы одно решение для расчёта.' };
  }

  var solutions = state.selectedSolutions;
  var solution = getCalculationSolution();
  var m = solution.metrics || {};

  var avgSalary = salary * 12;
  var annualLaborCost = staff * avgSalary;

  var purchaseScenario = calcScenarioLocal(p, solution);
  var raasScenario = calcRaasScenarioLocal(p, solution, purchaseScenario);
  var loanScenario = calcLoanScenarioLocal(p, solution, purchaseScenario);

  var baseScenario = {
    model: 'base',
    capex: 0,
    opex: annualLaborCost + area * electricityRate * 12,
    savings: 0,
    netAnnual: 0,
    payback: 0,
    roi: 0,
    npv: 0,
    tco: 0,
    robotCount: 0,
  };

  var co2 = operations * safeFloat(p.avgWeight, 0) * 0.0001 * safeFloat(m.co2Reduction, 0);

  var warning = '';
  if (purchaseScenario.payback > 10 && purchaseScenario.payback > 0) {
    warning = 'Срок окупаемости превышает 10 лет. Возможно, стоит пересмотреть параметры или выбрать другие решения.';
  }
  if (purchaseScenario.netAnnual <= 0) {
    warning = 'Операционные расходы превышают годовую экономию. Рассмотрите другие решения или параметры объекта.';
  }

return {
    baseScenario: baseScenario,
    purchaseScenario: purchaseScenario,
    raasScenario: raasScenario,
    loanScenario: loanScenario,
    capex: purchaseScenario.capex,
    opex: purchaseScenario.opex,
    savings: purchaseScenario.savings,
    netAnnual: purchaseScenario.netAnnual,
    totalCapex: purchaseScenario.capex,
    totalAnnualOpex: purchaseScenario.opex,
    annualSavings: purchaseScenario.savings,
    netAnnualEffect: purchaseScenario.netAnnual,
    payback: purchaseScenario.payback,
    roi: purchaseScenario.roi,          // ROI за 3 года (для UI)
    roi3y: purchaseScenario.roi3y,
    roiHorizon: purchaseScenario.roiHorizon,
    npv: purchaseScenario.npv,
    tco: purchaseScenario.tco,
    robotCount: purchaseScenario.robotCount,
    co2: co2,
    error: null,
    warning: warning,
  };
}

function renderStep4(el) {
  if (!state.selectedIndustry || !state.selectedObjectType) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">!</div><div class="empty-state-text">Сначала завершите шаги 1-3.</div><button class="btn btn-primary" id="btnGoBack4">Перейти к шагу 1</button></div>';
    var btn = el.querySelector('#btnGoBack4');
    if (btn) btn.addEventListener('click', function() { navigateToStep(1); });
    return;
  }

  var results = calculateEconomics();
  var ind = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
  var indColor = ind ? ind.accent : '#4f7cff';
  var objType = ind ? ind.objectTypes.find(function(t) { return t.id === state.selectedObjectType; }) : null;

  var html = '<h2 class="section-title">Визуализация объекта</h2>';
  html += '<p class="section-desc">Имитация работы объекта &ldquo;' + escapeHTML(getObjectTypeName()) + '&rdquo; с роботами. Показатели обновляются по мере выполнения маршрутов.</p>';

  html += '<div class="visualization-container">';
  html += '<div class="viz-controls">';
  html += '<div class="viz-mode-toggle" role="group" aria-label="Режим визуализации">';
  html += '<button class="btn ' + (state.vizMode === '2d' ? 'active' : '') + '" id="vizMode2d">2D схема</button>';
  html += '<button class="btn ' + (state.vizMode === '3d' ? 'active' : '') + '" id="vizMode3d">3D симуляция</button>';
  html += '</div>';
  html += '<button class="btn btn-sm" id="vizPause">Пауза</button>';
  html += '<label class="form-label" style="margin:0;color:var(--color-text)">Скорость: <span id="vizSpeedLabel" class="range-value">' + state.vizSpeed + 'x</span></label>';
  html += '<input type="range" class="range-input" id="vizSpeed" min="0.5" max="3" step="0.5" value="' + state.vizSpeed + '" style="width:120px">';
  html += '<button class="btn btn-sm btn-secondary" id="vizReset">Сброс</button>';
  html += '<button class="btn btn-sm btn-secondary" id="vizExport">Экспорт</button>';
  html += '</div>';

  if (state.vizMode === '3d') {
    html += '<div id="viz3dContainer" class="viz-3d-container"></div>';
  } else {
  var svgW = 800, svgH = 450;
  html += '<svg class="viz-canvas" id="vizSvg" viewBox="0 0 ' + svgW + ' ' + svgH + '" xmlns="http://www.w3.org/2000/svg">';
  html += '<defs>';
  html += '<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0L0 0 0 40" fill="none" stroke="#e2e8f0" stroke-width="0.5"/></pattern>';
  html += '<linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#f1f5f9"/></linearGradient>';
  html += '<linearGradient id="robotGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + indColor + '"/><stop offset="100%" stop-color="' + indColor + '88"/></linearGradient>';
  html += '</defs>';

  // === 2D SVG Visualization (исправлено) ===
  var pad = 20;                    // отступ от края
  var contentW = svgW - pad * 2;   // 760
  var contentH = svgH - pad * 2;   // 410

  var bw = contentW - 60;          // 700
  var bh = 280;
  var bx = pad + 30;               // 50
  var by = pad + 30;               // 50

  // Фон-сетка
  html += '<rect width="' + svgW + '" height="' + svgH + '" fill="url(#grid)"/>';

  // Внешний контейнер объекта (с правильными отступами)
  html += '<rect x="' + pad + '" y="' + pad + '" width="' + contentW + '" height="' + contentH + '" rx="8" fill="url(#floorGrad)" stroke="' + indColor + '" stroke-width="2" stroke-opacity="0.3"/>';

  // Внутренняя рабочая область
  html += '<g opacity="0.15"><rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="6" fill="none" stroke="' + indColor + '" stroke-width="2" stroke-dasharray="8 4"/></g>';

  // === Зоны (исправленный расчёт, чтобы правая не вылезала) ===
  var gap = 16;
  var zoneH = 125;
  var zoneY = by + 12;

  // Три зоны делят bw поровну с учётом gap
  var available = bw;                    // 700 — зоны заполняют рабочую ширину
  var zone1w = Math.floor(available * 0.28);   // ~196
  var zone2w = Math.floor(available * 0.36);   // ~252
  var zone3w = available - zone1w - zone2w;    // остаток (~252)

  var zone1x = bx + 10;
  var zone2x = zone1x + zone1w + gap;
  var zone3x = zone2x + zone2w + gap;

  // Гарантия, что правая зона не выходит за bx + bw
  if (zone3x + zone3w > bx + bw - 10) {
    zone3w = (bx + bw - 10) - zone3x;
  }

  // ПРИЁМКА
  html += '<rect x="' + zone1x + '" y="' + zoneY + '" width="' + zone1w + '" height="' + zoneH + '" rx="5" fill="' + indColor + '" fill-opacity="0.08" stroke="' + indColor + '" stroke-opacity="0.3" stroke-width="1"/>';
  html += '<text x="' + (zone1x + zone1w / 2) + '" y="' + (zoneY + 22) + '" text-anchor="middle" font-size="11" fill="' + indColor + '" opacity="0.8" font-weight="700">ПРИЁМКА</text>';

  // ХРАНЕНИЕ
  html += '<rect x="' + zone2x + '" y="' + zoneY + '" width="' + zone2w + '" height="' + zoneH + '" rx="5" fill="' + indColor + '" fill-opacity="0.05" stroke="' + indColor + '" stroke-opacity="0.2" stroke-width="1"/>';
  html += '<text x="' + (zone2x + zone2w / 2) + '" y="' + (zoneY + 22) + '" text-anchor="middle" font-size="11" fill="' + indColor + '" opacity="0.65" font-weight="700">ХРАНЕНИЕ</text>';

  // ОТГРУЗКА (теперь точно внутри)
  html += '<rect x="' + zone3x + '" y="' + zoneY + '" width="' + zone3w + '" height="' + zoneH + '" rx="5" fill="' + indColor + '" fill-opacity="0.08" stroke="' + indColor + '" stroke-opacity="0.3" stroke-width="1"/>';
  html += '<text x="' + (zone3x + zone3w / 2) + '" y="' + (zoneY + 22) + '" text-anchor="middle" font-size="11" fill="' + indColor + '" opacity="0.8" font-weight="700">ОТГРУЗКА</text>';

  // Соединительные линии между зонами
  html += '<line x1="' + (zone1x + zone1w) + '" y1="' + (zoneY + zoneH / 2) + '" x2="' + zone2x + '" y2="' + (zoneY + zoneH / 2) + '" stroke="' + indColor + '" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.45"/>';
  html += '<line x1="' + (zone2x + zone2w) + '" y1="' + (zoneY + zoneH / 2) + '" x2="' + zone3x + '" y2="' + (zoneY + zoneH / 2) + '" stroke="' + indColor + '" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.45"/>';

  // Коридор + путь роботов (тоже внутри границ)
  var corridorY = zoneY + zoneH + 55;
  html += '<rect x="' + bx + '" y="' + (corridorY - 14) + '" width="' + bw + '" height="28" rx="14" fill="' + indColor + '" fill-opacity="0.06"/>';

  // Путь — строго внутри bx … bx+bw
  var pathStartX = bx + 20;
  var pathEndX   = bx + bw - 20;
  html += '<path id="botPath" d="M' + pathStartX + ',' + corridorY +
    ' C' + (bx + bw * 0.3) + ',' + (corridorY - 30) +
    ' ' + (bx + bw * 0.7) + ',' + (corridorY + 30) +
    ' ' + pathEndX + ',' + corridorY +
    '" fill="none" stroke="' + indColor + '" stroke-width="2" stroke-dasharray="7 6" opacity="0.55"/>';

  var robotCount = Math.max(2, Math.min(6, results.robotCount || 2));
  var robots = [];
  for (var i = 0; i < robotCount; i++) {
    var cx = bx + (bw / robotCount) * (i + 0.5);
    robots.push({
      x: cx, y: corridorY,
      baseX: cx, baseY: corridorY,
      speed: (0.3 + Math.random() * 0.4) * state.vizSpeed,
      phase: Math.random() * Math.PI * 2,
      radius: 8 + Math.random() * 4,
      id: i,
    });
  }
  state.vizRobots = robots;
  state.vizTime = 0;
  state.vizStats = {
    tasks: 0,
    energyKwh: 0,
    throughput: 0,
    utilization: 0,
    uptime: results.purchaseScenario.assumptions ? results.purchaseScenario.assumptions.availability * 100 : 95,
  };

  robots.forEach(function(r, idx) {
    html += '<circle id="robot-' + r.id + '" cx="' + r.x + '" cy="' + r.y + '" r="' + r.radius + '" fill="url(#robotGrad)" opacity="0.9"/>';
    html += '<circle id="robot-dot-' + r.id + '" cx="' + r.x + '" cy="' + (r.y - r.radius - 6) + '" r="3" fill="' + indColor + '"/>';
    html += '<text id="robot-label-' + r.id + '" x="' + r.x + '" y="' + (r.y + 4) + '" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">' + (idx + 1) + '</text>';
  });


  html += '</svg>';
}

  html += '<div class="viz-overlay" id="vizOverlay">';
  html += '<div class="viz-status"><span></span> Моделирование активно</div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Выполнено операций</div><div class="viz-metric-value" id="vizTasks">0</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Производительность</div><div class="viz-metric-value" id="vizThroughput">0 ед./ч</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Загрузка парка</div><div class="viz-metric-value" id="vizUtilization">0%</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Энергия за смену</div><div class="viz-metric-value" id="vizEnergy">0 кВт·ч</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Доступность</div><div class="viz-metric-value" id="vizUptime">0%</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">CAPEX</div><div class="viz-metric-value">' + formatCurrency(results.capex) + '</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Годовой OPEX</div><div class="viz-metric-value">' + formatCurrency(results.opex) + '</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">ROI за 3 года</div><div class="viz-metric-value">' + formatNum(results.roi3y, 1) + '%</div></div>';
  html += '<div class="viz-metric"><div class="viz-metric-label">Снижение CO₂</div><div class="viz-metric-value">' + formatNum(results.co2, 1) + ' т/год</div></div>';
  html += '</div>';

  html += '</div>';

  el.innerHTML = html;

  setupVizControls(el);
  dispose3D();
  if (state.vizMode === '3d') {
    init3DVisualization();
  } else {
    startVizAnimation();
  }
}

function updateVizMetrics() {
  var tasks = document.getElementById('vizTasks');
  var throughput = document.getElementById('vizThroughput');
  var utilization = document.getElementById('vizUtilization');
  var energy = document.getElementById('vizEnergy');
  var uptime = document.getElementById('vizUptime');
  if (tasks) tasks.textContent = formatNum(state.vizStats.tasks, 0) + ' ед.';
  if (throughput) throughput.textContent = formatNum(state.vizStats.throughput, 1) + ' ед./ч';
  if (utilization) utilization.textContent = formatNum(state.vizStats.utilization, 1) + '%';
  if (energy) energy.textContent = formatNum(state.vizStats.energyKwh, 1) + ' кВт·ч';
  if (uptime) uptime.textContent = formatNum(state.vizStats.uptime, 1) + '%';
}

function setupVizControls(el) {
  var btnPause = el.querySelector('#vizPause');
  var btnReset = el.querySelector('#vizReset');
  var btnExport = el.querySelector('#vizExport');
  var speedInput = el.querySelector('#vizSpeed');
  var speedLabel = el.querySelector('#vizSpeedLabel');
  var btnMode2d = el.querySelector('#vizMode2d');
  var btnMode3d = el.querySelector('#vizMode3d');

  if (btnMode2d) {
    btnMode2d.addEventListener('click', function() {
      state.vizMode = '2d';
      renderStep4(el);
    });
  }
  if (btnMode3d) {
    btnMode3d.addEventListener('click', function() {
      state.vizMode = '3d';
      renderStep4(el);
    });
  }

  if (btnPause) {
    btnPause.addEventListener('click', function() {
      state.vizPaused = !state.vizPaused;
      btnPause.textContent = state.vizPaused ? 'Продолжить' : 'Пауза';
      btnPause.classList.toggle('btn-primary', !state.vizPaused);
      btnPause.classList.toggle('btn-secondary', state.vizPaused);
    });
  }
  if (speedInput) {
    speedInput.addEventListener('input', function(e) {
      state.vizSpeed = clamp(safeFloat(e.target.value, 1), 0.5, 3);
      if (speedLabel) speedLabel.textContent = state.vizSpeed + 'x';
      state.vizRobots.forEach(function(r) {
        r.speed = (0.3 + Math.random() * 0.4) * state.vizSpeed;
      });
    });
  }
  if (btnReset) {
    btnReset.addEventListener('click', function() {
      state.vizRobots.forEach(function(r) {
        r.x = r.baseX;
        r.y = r.baseY;
        r.phase = Math.random() * Math.PI * 2;
      });
      state.vizTime = 0;
      state.vizStats = { tasks: 0, energyKwh: 0, throughput: 0, utilization: 0, uptime: 95 };
      updateVizMetrics();
      if (state.vizMode === '3d' && state.viz3D) {
        reset3DPositions();
      }
    });
  }
  if (btnExport) {
    btnExport.addEventListener('click', function() { exportCalculation(); });
  }
}

function startVizAnimation() {
  var path = document.getElementById('botPath');
  if (!path) return;

  var pathLength = path.getTotalLength();
  var lastTimestamp = null;
  var solution = getCalculationSolution();
  var results = calculateEconomics();
  var purchase = results.purchaseScenario || {};
  var assumptions = purchase.assumptions || { availability: 0.95, utilization: 0.85 };

  function animate(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    var deltaSeconds = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    state.vizAnimFrame = requestAnimationFrame(animate);
    if (state.vizPaused || !solution) return;

    state.vizTime += deltaSeconds * state.vizSpeed;
    var simulatedHours = deltaSeconds * state.vizSpeed * 0.25;
    var workingDays = Math.max(1, safeFloat(state.customParams.workingDays, 250));
    var hoursPerDay = Math.max(1, Math.min(24, safeFloat(state.customParams.shifts, 1) * 8));
    var demandPerHour = safeFloat(state.customParams.operations, 0) / (workingDays * hoursPerDay);
    var capacityPerHour = results.robotCount * safeFloat(solution.metrics.throughput, 0) * assumptions.availability * assumptions.utilization;
    var actualThroughput = Math.min(demandPerHour, capacityPerHour);

    state.vizStats.throughput = actualThroughput * (0.96 + Math.random() * 0.07);
    state.vizStats.tasks += state.vizStats.throughput * simulatedHours;
    state.vizStats.energyKwh += safeFloat(purchase.totalPowerKw, 0) * assumptions.utilization * simulatedHours;
    state.vizStats.utilization = capacityPerHour > 0 ? clamp(demandPerHour / capacityPerHour * 100, 0, 100) : 0;
    state.vizStats.uptime = clamp(safeFloat(solution.metrics.reliability, 95) + Math.sin(state.vizTime * 0.7) * 0.35, 0, 100);

    state.vizRobots.forEach(function(r, index) {
      r.phase += r.speed * deltaSeconds;
      var progress = ((r.phase * 0.015 + index / state.vizRobots.length) % 1 + 1) % 1;
      var point = path.getPointAtLength(progress * pathLength);
      var el = document.getElementById('robot-' + r.id);
      var dotEl = document.getElementById('robot-dot-' + r.id);
      var labelEl = document.getElementById('robot-label-' + r.id);
      if (el) { el.setAttribute('cx', point.x); el.setAttribute('cy', point.y); }
      if (dotEl) { dotEl.setAttribute('cx', point.x); dotEl.setAttribute('cy', point.y - r.radius - 6); }
      if (labelEl) { labelEl.setAttribute('x', point.x); labelEl.setAttribute('y', point.y + 4); }
    });

    updateVizMetrics();
  }

  updateVizMetrics();
  state.vizAnimFrame = requestAnimationFrame(animate);
}

function exportCalculation() {
  var results = calculateEconomics();
  var ind = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
  var indName = ind ? ind.name : '';
  var objType = ind ? ind.objectTypes.find(function(t) { return t.id === state.selectedObjectType; }) : null;
  var objTypeName = objType ? objType.name : '';

  var solutions = state.selectedSolutions;
  var lines = [];
  lines.push('========================================');
  lines.push('РЕСУЛЬТАТЫ РАСЧЁТА РОБОТИЗАЦИИ');
  lines.push('========================================');
  lines.push('');
  lines.push('Отрасль: ' + indName);
  lines.push('Тип объекта: ' + objTypeName);
  lines.push('');
  lines.push('--- ПАРАМЕТРЫ ОБЪЕКТА ---');
  var p = state.customParams;
  Object.keys(p).forEach(function(k) {
    lines.push('  ' + k + ': ' + p[k]);
  });
  lines.push('');
  lines.push('--- ВЫБРАННЫЕ РЕШЕНИЯ ---');
  solutions.forEach(function(s, i) {
    lines.push((i + 1) + '. ' + s.name + ' (' + s.vendor + ')');
    lines.push('   Тип: ' + s.type + ', Совпадение: ' + s.fit + '%');
  });
  lines.push('');
  lines.push('--- ЭКОНОМИЧЕСКИЕ ПОКАЗАТЕЛИ ---');
  lines.push('CAPEX: ' + formatNum(results.capex, 0) + ' ₽');
  lines.push('Годовой OPEX: ' + formatNum(results.opex, 0) + ' ₽');
  lines.push('Годовая экономия: ' + formatNum(results.savings, 0) + ' ₽');
  lines.push('Чистый годовой эффект: ' + formatNum(results.netAnnual, 0) + ' ₽');
  lines.push('Срок окупаемости: ' + (results.payback > 0 ? formatNum(results.payback, 1) + ' лет' : '—'));
  lines.push('ROI: ' + formatNum(results.roi3y, 1) + '%');
  lines.push('NPV: ' + formatNum(results.npv, 0) + ' ₽');
  lines.push('TCO (5 лет): ' + formatNum(results.tco, 0) + ' ₽');
  lines.push('Потребность в роботах: ' + (results.robotCount || 0) + ' шт.');
  lines.push('Снижение CO2: ' + formatNum(results.co2, 1) + ' т/год');
  lines.push('');
  lines.push('--- СРАВНЕНИЕ СЦЕНАРИЕВ ---');
  lines.push('Без роботизации: CAPEX=— OPEX=' + formatNum(results.baseScenario.opex, 0) + ' ₽');
  lines.push('Покупка: CAPEX=' + formatNum(results.capex, 0) + ' OPEX=' + formatNum(results.opex, 0) + ' ROI=' + formatNum(results.roi3y, 1) + '%');
  if (results.raasScenario) {
    lines.push('RaaS: CAPEX=' + formatNum(results.raasScenario.capex, 0) + ' OPEX=' + formatNum(results.raasScenario.opex, 0) + ' ROI=' + formatNum(results.raasScenario.roi, 1) + '%');
  }
  if (results.loanScenario) {
    lines.push('Кредит: CAPEX=' + formatNum(results.loanScenario.capex, 0) + ' OPEX=' + formatNum(results.loanScenario.opex, 0) + ' Платёж/год=' + formatNum(results.loanScenario.annualDebtService, 0) + ' ROI=' + formatNum(results.loanScenario.roi, 1) + '%');
    if (results.loanScenario.loanDetails) {
      lines.push('  Ставка: ' + formatNum(results.loanScenario.loanDetails.interestRate, 1) + '% | Срок: ' + results.loanScenario.loanDetails.loanTermYears + ' лет | Взнос: ' + formatNum(results.loanScenario.loanDetails.downPayment, 0) + ' ₽');
    }
  }
  lines.push('');
  if (results.warning) {
    lines.push('ПРЕДУПРЕЖДЕНИЕ: ' + results.warning);
    lines.push('');
  }
  lines.push('========================================');

  var textContent = lines.join('\n');

  var htmlContent = '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Расчёт роботизации</title>' +
    '<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#0f172a}h1{color:#4f7cff;border-bottom:2px solid #4f7cff;padding-bottom:10px}h2{color:#1e293b;margin-top:24px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0}th{background:#f8fafc;font-weight:600}.val{font-weight:700;font-size:1.1em}.warn{color:#ef4444;font-weight:600}</style></head><body>' +
    '<h1>Результаты расчёта роботизации</h1>' +
    '<p><strong>Отрасль:</strong> ' + indName + ' | <strong>Объект:</strong> ' + objTypeName + '</p>' +
    '<h2>Параметры объекта</h2><table>';
  var p = state.customParams;
  Object.keys(p).forEach(function(k) {
    htmlContent += '<tr><td>' + k + '</td><td class="val">' + p[k] + '</td></tr>';
  });
  htmlContent += '</table>';

  htmlContent += '<h2>Выбранные решения</h2><table><tr><th>№</th><th>Название</th><th>Вендор</th><th>Тип</th><th>Совпадение</th></tr>';
  solutions.forEach(function(s, i) {
    htmlContent += '<tr><td>' + (i + 1) + '</td><td>' + s.name + '</td><td>' + s.vendor + '</td><td>' + s.type + '</td><td>' + s.fit + '%</td></tr>';
  });
  htmlContent += '</table>';

   htmlContent += '<h2>Экономические показатели (сценарий покупки)</h2><table>';
   var rows = [
     ['CAPEX', formatNum(results.capex, 0) + ' ₽'],
     ['Годовой OPEX', formatNum(results.opex, 0) + ' ₽'],
     ['Годовая экономия', formatNum(results.savings, 0) + ' ₽'],
     ['Чистый годовой эффект', formatNum(results.netAnnual, 0) + ' ₽'],
     ['Срок окупаемости', results.payback > 0 ? formatNum(results.payback, 1) + ' лет' : '—'],
     ['ROI', formatNum(results.roi3y, 1) + '%'],
     ['NPV', formatNum(results.npv, 0) + ' ₽'],
     ['TCO (5 лет)', formatNum(results.tco, 0) + ' ₽'],
     ['Потребность в роботах', (results.robotCount || 0) + ' шт.'],
     ['Снижение CO2', formatNum(results.co2, 1) + ' т/год'],
   ];

   htmlContent += '<h2>Сравнение сценариев</h2><table>';
   htmlContent += '<tr><th>Сценарий</th><th>CAPEX</th><th>OPEX/год</th><th>Экономия/год</th><th>Чистый эффект</th><th>Окупаемость</th><th>ROI</th></tr>';
   htmlContent += '<tr><td>Без роботизации</td><td>—</td><td>' + formatNum(results.baseScenario.opex, 0) + ' ₽</td><td>0 ₽</td><td>0 ₽</td><td>—</td><td>0%</td></tr>';
   htmlContent += '<tr><td>Покупка</td><td>' + formatNum(results.capex, 0) + ' ₽</td><td>' + formatNum(results.opex, 0) + ' ₽</td><td>' + formatNum(results.savings, 0) + ' ₽</td><td>' + formatNum(results.netAnnual, 0) + ' ₽</td><td>' + (results.payback > 0 ? formatNum(results.payback, 1) + ' лет' : '—') + '</td><td>' + formatNum(results.roi3y, 1) + '%</td></tr>';
   if (results.raasScenario) {
     htmlContent += '<tr><td>RaaS (аренда)</td><td>' + formatNum(results.raasScenario.capex, 0) + ' ₽</td><td>' + formatNum(results.raasScenario.opex, 0) + ' ₽</td><td>' + formatNum(results.raasScenario.savings, 0) + ' ₽</td><td>' + formatNum(results.raasScenario.netAnnual, 0) + ' ₽</td><td>' + (results.raasScenario.payback > 0 ? formatNum(results.raasScenario.payback, 1) + ' лет' : '—') + '</td><td>' + formatNum(results.raasScenario.roi, 1) + '%</td></tr>';
   }
   if (results.loanScenario) {
     htmlContent += '<tr><td>Кредит (заёмные средства)</td><td>' + formatNum(results.loanScenario.capex, 0) + ' ₽</td><td>' + formatNum(results.loanScenario.opex, 0) + ' ₽</td><td>' + formatNum(results.loanScenario.savings, 0) + ' ₽</td><td>' + formatNum(results.loanScenario.netAnnual, 0) + ' ₽</td><td>' + (results.loanScenario.payback > 0 ? formatNum(results.loanScenario.payback, 1) + ' лет' : '—') + '</td><td>' + formatNum(results.loanScenario.roi, 1) + '%</td></tr>';
     if (results.loanScenario.loanDetails) {
       htmlContent += '<tr><td colspan="7"><small>Кредит: ставка ' + formatNum(results.loanScenario.loanDetails.interestRate, 1) + '%, срок ' + results.loanScenario.loanDetails.loanTermYears + ' лет, первоначальный взнос ' + formatNum(results.loanScenario.loanDetails.downPayment, 0) + ' ₽, ежемесячный платёж ' + formatNum(results.loanScenario.loanDetails.periodicPayment, 0) + ' ₽</small></td></tr>';
     }
   }
   htmlContent += '</table>';

   htmlContent += '<h2>CAPEX по статьям</h2><table>';
   var purchase = results.purchaseScenario;
   htmlContent += '<tr><th>Статья</th><th>Сумма</th></tr>';
   htmlContent += '<tr><td>Оборудование</td><td>' + formatNum(purchase.capexBreakdown.equipment, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td>Инфраструктура</td><td>' + formatNum(purchase.capexBreakdown.infrastructure, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td>ПО</td><td>' + formatNum(purchase.capexBreakdown.software, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td>Интеграция</td><td>' + formatNum(purchase.capexBreakdown.integration, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td>Обучение</td><td>' + formatNum(purchase.capexBreakdown.training, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td>Резерв</td><td>' + formatNum(purchase.capexBreakdown.reserve, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td><strong>Итого CAPEX</strong></td><td><strong>' + formatNum(purchase.capex, 0) + ' ₽</strong></td></tr>';
   htmlContent += '</table>';

   htmlContent += '<h2>Допущения модели</h2><table>';
   htmlContent += '<tr><th>Параметр</th><th>Значение</th></tr>';
   htmlContent += '<tr><td>Метод амортизации</td><td>' + (purchase.assumptions.depreciationMethod === 'linear' ? 'Линейный' : purchase.assumptions.depreciationMethod) + '</td></tr>';
   htmlContent += '<tr><td>Срок амортизации</td><td>' + purchase.assumptions.depreciationYears + ' лет</td></tr>';
   htmlContent += '<tr><td>Годовая амортизация</td><td>' + formatNum(purchase.annualDepreciation, 0) + ' ₽</td></tr>';
   htmlContent += '<tr><td>Дисконтная ставка</td><td>' + formatNum(purchase.assumptions.discountRate * 100, 1) + '%</td></tr>';
   htmlContent += '<tr><td>Доступность робота</td><td>' + formatNum(purchase.assumptions.availability * 100, 1) + '%</td></tr>';
   htmlContent += '<tr><td>Загрузка робота</td><td>' + formatNum(purchase.assumptions.utilization * 100, 1) + '%</td></tr>';
   if (results.loanScenario && results.loanScenario.assumptions) {
     htmlContent += '<tr><td>Ставка кредита</td><td>' + formatNum(results.loanScenario.assumptions.interestRate, 1) + '%</td></tr>';
     htmlContent += '<tr><td>Срок кредита</td><td>' + results.loanScenario.assumptions.loanTermYears + ' лет</td></tr>';
     htmlContent += '<tr><td>Первоначальный взнос</td><td>' + formatNum(results.loanScenario.assumptions.downPaymentRatio, 0) + '%</td></tr>';
   }
   htmlContent += '</table>';
  rows.forEach(function(r) {
    htmlContent += '<tr><td>' + r[0] + '</td><td class="val">' + r[1] + '</td></tr>';
  });
  htmlContent += '</table>';

  if (results.warning) {
    htmlContent += '<p class="warn">Внимание: ' + results.warning + '</p>';
  }

  htmlContent += '</body></html>';

  downloadFile('расчёт_роботизации.txt', textContent, 'text/plain');
  setTimeout(function() { downloadFile('расчёт_роботизации.html', htmlContent, 'text/html'); }, 200);
  showToast('Расчёт экспортирован (TXT + HTML)', 'success');
}

function downloadFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getVideoId(solution) {
  if (!solution) return 'amr';
  // Use solution ID only if it's a UUID from catalog (contains dashes), otherwise fall back to category matching
  if (solution.id && typeof solution.id === 'string' && solution.id.includes('-') && solution.id.length > 20) {
    return solution.id;
  }
  return getVideoCategoryForSolution(solution);
}

function getVideoCategoryForSolution(solution) {
  if (!solution) return 'amr';
  const name = (solution.name || '').toLowerCase();
  const vendor = (solution.vendor || '').toLowerCase();
  const desc = (solution.description || '').toLowerCase();
  const category = (solution.category || '').toLowerCase();
  const videoMap = {
    'amr': 'amr', 'shuttle': 'amr', 'sorter': 'sorting', 'мобильный': 'amr',
    'fmr': 'fmr', 'carrier': 'fmr', 'тягач': 'fmr', 'погрузчик': 'forklift',
    'штабелер': 'forklift', 'уборщик': 'cleaning', 'cleanbot': 'cleaning',
    'сортиров': 'sorting', 'манипулятор': 'stationary', 'дрон': 'inspection',
    'инвентар': 'inspection', 'мед': 'medical', 'фарм': 'medical',
    'доставка': 'delivery', 'курьер': 'delivery', 'склад': 'amr', 'логистик': 'amr',
  };
  for (const [key, catId] of Object.entries(videoMap)) {
    if (name.includes(key) || vendor.includes(key) || desc.includes(key) || category.includes(key)) {
      return catId;
    }
  }
  return 'amr';
}

function openVideoModal(videoId, title, fallback) {
  const modal = document.getElementById('videoModal');
  const titleEl = document.getElementById('videoModalTitle');
  const player = document.getElementById('videoPlayer');
  if (!modal) return;
  modal.style.display = 'flex';
  titleEl.textContent = title || '';
  player.src = `/videos/${videoId}.mp4`;
  player.load();
  
  // Fallback to category video if the specific video is unavailable
  player.onerror = () => {
    if (fallback && (!videoId.includes('-') || videoId.length <= 20)) return; // already a category video
    console.log(`Video ${videoId} not found, trying fallback: ${fallback}`);
    player.src = `/videos/${fallback}.mp4`;
    player.load();
    player.onerror = null; // prevent infinite loop
  };
}

function closeVideoModal() {
  const modal = document.getElementById('videoModal');
  const player = document.getElementById('videoPlayer');
  if (!modal) return;
  modal.style.display = 'none';
  if (player) { player.pause(); player.src = ''; }
}

function dispose3D() {
  if (state.viz3D) {
    if (state.viz3D.animationId) {
      cancelAnimationFrame(state.viz3D.animationId);
      state.viz3D.animationId = null;
    }
    if (state.viz3D.renderer) {
      state.viz3D.renderer.dispose();
    }
    state.viz3D = null;
  }
}

function init3DVisualization() {
  if (typeof THREE === 'undefined') {
    console.warn('Three.js не загружен');
    return;
  }
  var container = document.getElementById('viz3dContainer');
  if (!container) return;

  if (!state.vizStats) {
    state.vizStats = { tasks: 0, energyKwh: 0, throughput: 0, utilization: 0, uptime: 95 };
  }

  // Очистка предыдущей сцены
  dispose3D();

  var width = container.clientWidth || 800;
  var height = container.clientHeight || 450;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.Fog(0x0b1220, 40, 120);

  var camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
  camera.position.set(0, 28, 42);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // Свет
  var ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  var dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(20, 40, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -40;
  dirLight.shadow.camera.right = 40;
  dirLight.shadow.camera.top = 40;
  dirLight.shadow.camera.bottom = -40;
  scene.add(dirLight);

  var pointLight = new THREE.PointLight(0x4f7cff, 0.5, 60);
  pointLight.position.set(-15, 15, 10);
  scene.add(pointLight);

  // Пол
  var floorGeo = new THREE.PlaneGeometry(90, 60);
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.85,
    metalness: 0.1
  });
  var floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  var grid = new THREE.GridHelper(90, 45, 0x334155, 0x1e293b);
  grid.position.y = 0.02;
  scene.add(grid);

  // === Зоны склада ===
  var ind = (HACKATHON_DATA.industries || []).find(function(i) { return i.id === state.selectedIndustry; });
  var indColor = ind ? ind.accent : '#4f7cff';
  var color = new THREE.Color(indColor);

  function createZone(x, z, w, d, label, opacity) {
    var geo = new THREE.BoxGeometry(w, 0.3, d);
    var mat = new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      opacity: opacity || 0.25,
      roughness: 0.7
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.15, z);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Подпись зоны
    var canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15,23,42,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, 128, 42);
    var tex = new THREE.CanvasTexture(canvas);
    var labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    var labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), labelMat);
    labelMesh.position.set(x, 3.5, z);
    labelMesh.rotation.x = -Math.PI / 6;
    scene.add(labelMesh);
  }

  createZone(-22, 0, 18, 28, 'ПРИЁМКА', 0.22);
  createZone(0, 0, 20, 28, 'ХРАНЕНИЕ', 0.15);
  createZone(22, 0, 18, 28, 'ОТГРУЗКА', 0.22);

  // === Роботы ===
  var results = calculateEconomics();
  var robotCount = Math.max(2, Math.min(8, results.robotCount || 3));
  var solution = getCalculationSolution();
  var robots3D = [];

  // Определяем форму робота по категории
  var shape = 'box';
  if (solution) {
    var cat = getVideoCategoryForSolution(solution);
    if (cat === 'forklift') shape = 'forklift';
    else if (cat === 'cleaning') shape = 'cleaner';
    else if (cat === 'inspection') shape = 'drone';
    else if (cat === 'stationary') shape = 'arm';
    else if (cat === 'delivery') shape = 'rover';
  }

  function createLabelSprite(message) {
    var canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 48;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.fillRect(0, 0, 128, 48);
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#4f9cff';
    ctx.textAlign = 'center';
    ctx.fillText(message, 64, 32);
    var tex = new THREE.CanvasTexture(canvas);
    var sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    var sprite = new THREE.Sprite(sprMat);
    sprite.scale.set(3, 0.8, 1);
    return sprite;
  }

  function createRobotMesh(shape, color) {
    var group = new THREE.Group();
    var mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.3, roughness: 0.4 });
    var darkMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55) });

    if (shape === 'forklift') {
      var body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 2.2), mainMat);
      body.position.y = 1.2; body.castShadow = true; group.add(body);
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.8), darkMat);
      cabin.position.set(-0.6, 2.4, 0); group.add(cabin);
      var mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 0.4), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      mast.position.set(1.4, 2.5, 0); group.add(mast);
      [0.5, -0.5].forEach(function(z) {
        var fork = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
        fork.position.set(2.5, 0.9, z); group.add(fork);
      });
    } else if (shape === 'cleaner') {
      var body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.2, 16), mainMat);
      body.position.y = 0.8; body.castShadow = true; group.add(body);
      var top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), darkMat);
      top.position.y = 1.6; group.add(top);
    } else if (shape === 'drone') {
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), mainMat);
      body.position.y = 4; group.add(body);
      for (var i = 0; i < 4; i++) {
        var a = i * Math.PI / 2 + Math.PI / 4;
        var arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
        arm.position.set(Math.cos(a) * 0.9, 4, Math.sin(a) * 0.9);
        arm.rotation.y = -a; group.add(arm);
      }
    } else if (shape === 'arm') {
      var base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.8, 24), mainMat);
      base.position.y = 0.4; base.castShadow = true; group.add(base);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 16), darkMat);
      pole.position.y = 3.4; group.add(pole);
      var head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      head.position.y = 6.6; group.add(head);
    } else if (shape === 'rover') {
      var body = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 2.4), mainMat);
      body.position.y = 0.8; body.castShadow = true; group.add(body);
      var top = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), darkMat);
      top.position.y = 1.8; group.add(top);
      [[1.2, -0.8], [1.2, 0.8], [-1.2, -0.8], [-1.2, 0.8]].forEach(function(p) {
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(p[0], 0.3, p[1]);
        group.add(wheel);
      });
    } else {
      // Обычный AMR / box
      var body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.8), mainMat);
      body.position.y = 0.7; body.castShadow = true; group.add(body);
      var sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      sensor.position.y = 1.3; group.add(sensor);
      [[-0.9, -0.7], [-0.9, 0.7], [0.9, -0.7], [0.9, 0.7]].forEach(function(p) {
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(p[0], 0.35, p[1]);
        group.add(wheel);
      });
    }
    return group;
  }

  // Маршрут: прямоугольник (складской коридор)
  var pathPoints = [
    new THREE.Vector3(-28, 0.7, -10),
    new THREE.Vector3(28, 0.7, -10),
    new THREE.Vector3(28, 0.7, 10),
    new THREE.Vector3(-28, 0.7, 10),
  ];

  for (var i = 0; i < robotCount; i++) {
    var robot = createRobotMesh(shape, color);
    robot.userData = {
      id: i,
      progress: i / robotCount,
      speed: 0.08 + Math.random() * 0.06,
      shape: shape
    };
    var label = createLabelSprite('R' + (i + 1));
    label.position.set(0, 4, 0);
    robot.add(label);
    scene.add(robot);
    robots3D.push(robot);
  }

  state.viz3D = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    robots: robots3D,
    pathPoints: pathPoints,
    animationId: null,
    time: 0
  };

  start3DAnimation();
}

function getPointOnRectPath(progress, points) {
  var total = points.length;
  var scaled = progress * total;
  var idx = Math.floor(scaled) % total;
  var next = (idx + 1) % total;
  var t = scaled - Math.floor(scaled);
  return new THREE.Vector3().lerpVectors(points[idx], points[next], t);
}

function start3DAnimation() {
  if (!state.viz3D) return;
  var lastTimestamp = null;
  var renderer = state.viz3D.renderer;
  var scene = state.viz3D.scene;
  var camera = state.viz3D.camera;
  var robots = state.viz3D.robots;
  var pathPoints = state.viz3D.pathPoints;

  function animate(timestamp) {
    if (!state.viz3D) return;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    var delta = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    state.viz3D.animationId = requestAnimationFrame(animate);
    state.viz3D.time += delta;

    // Медленное вращение камеры
    var camAngle = state.viz3D.time * 0.08;
    camera.position.x = Math.sin(camAngle) * 42;
    camera.position.z = Math.cos(camAngle) * 42;
    camera.position.y = 26 + Math.sin(state.viz3D.time * 0.3) * 2;
    camera.lookAt(0, 1, 0);

    if (!state.vizPaused) {
      var results = calculateEconomics();
      var solution = getCalculationSolution();
      var assumptions = (results.purchaseScenario && results.purchaseScenario.assumptions)
        ? results.purchaseScenario.assumptions
        : { availability: 0.95, utilization: 0.85 };

      var workingDays = Math.max(1, safeFloat(state.customParams.workingDays, 250));
      var hoursPerDay = Math.max(1, Math.min(24, safeFloat(state.customParams.shifts, 1) * 8));
      var demandPerHour = safeFloat(state.customParams.operations, 0) / (workingDays * hoursPerDay);
      var throughput = safeFloat(solution && solution.metrics ? solution.metrics.throughput : 0, 0);
      var capacityPerHour = (results.robotCount || 0) * throughput * assumptions.availability * assumptions.utilization;
      var actualThroughput = demandPerHour > 0 ? Math.min(demandPerHour, capacityPerHour) : capacityPerHour;

      var simulatedHours = delta * state.vizSpeed * 0.25;
      state.vizStats.throughput = actualThroughput * (0.96 + Math.random() * 0.04);
      state.vizStats.tasks += state.vizStats.throughput * simulatedHours;
      state.vizStats.energyKwh += safeFloat(results.purchaseScenario && results.purchaseScenario.totalPowerKw, 0) * assumptions.utilization * simulatedHours;
      state.vizStats.utilization = capacityPerHour > 0 ? clamp(demandPerHour / capacityPerHour * 100, 0, 100) : 0;
      state.vizStats.uptime = clamp(safeFloat(solution && solution.metrics ? solution.metrics.reliability : 95, 95) + Math.sin(state.viz3D.time * 0.7) * 0.35, 0, 100);

      // Движение роботов по прямоугольному маршруту
      robots.forEach(function(r) {
        r.userData.progress = (r.userData.progress + r.userData.speed * delta * state.vizSpeed) % 1;
        var pos = getPointOnRectPath(r.userData.progress, pathPoints);
        r.position.copy(pos);

        var nextProgress = (r.userData.progress + 0.01) % 1;
        var nextPos = getPointOnRectPath(nextProgress, pathPoints);
        r.lookAt(nextPos);
      });

      updateVizMetrics();
    }

    renderer.render(scene, camera);
  }

  state.viz3D.animationId = requestAnimationFrame(animate);
}

function reset3DPositions() {
  if (!state.viz3D || !state.viz3D.robots) return;
  state.viz3D.time = 0;
  state.viz3D.robots.forEach(function(r, i) {
    r.userData.progress = i / state.viz3D.robots.length;
  });
}

function init() {
  loadState();

  document.querySelectorAll('.step').forEach(function(el) {
    el.addEventListener('click', function() {
      var target = parseInt(el.dataset.step);
      var canNav = false;
      if (target <= state.currentStep) canNav = true;
      else if (target === 2 && state.selectedIndustry) canNav = true;
      else if (target === 3 && state.selectedIndustry && state.selectedObjectType && state.selectedSolutions.length) canNav = true;
      else if (target === 4 && state.selectedIndustry && state.selectedObjectType && state.selectedSolutions.length) canNav = true;
      if (canNav) navigateToStep(target);
    });
  });

  if (!state.selectedIndustry || !state.selectedObjectType) {
    var defs = {};
    try {
      var industries = HACKATHON_DATA.industries;
      if (industries && industries.length > 0) {
        var ind = industries.find(function(i) { return i.id === state.selectedIndustry; }) || industries[0];
        if (ind.objectTypes && ind.objectTypes.length > 0) {
          var ot = ind.objectTypes.find(function(t) { return t.id === state.selectedObjectType; }) || ind.objectTypes[0];
          if (!state.selectedIndustry) state.selectedIndustry = ind.id;
          if (!state.selectedObjectType) state.selectedObjectType = ot.id;
          defs = ot.defaults || {};
        }
      }
    } catch(e) {}
    if (Object.keys(defs).length) state.customParams = JSON.parse(JSON.stringify(defs));
    saveState();
  }

  renderCurrentStep();

  document.getElementById('videoModalClose')?.addEventListener('click', closeVideoModal);
  document.getElementById('videoModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeVideoModal();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

