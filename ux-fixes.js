/* ============================================================================
 * ux-fixes.js — исправления UX и мобильного интерфейса
 *
 *  1. Переопределяет init(): убирает авто-выбор отрасли/типа объекта при
 *     первом открытии — шаг 1 начинается с чистого выбора отрасли, а не с
 *     «контента второй страницы».
 *  2. Синхронизирует подсветку шагов навигации с фактическим шагом
 *     (исправляет случай, когда контент шага N отображался при активном
 *     шаге 1 из-за восстановленного состояния из localStorage).
 *  3. Сохраняет всю остальную логику (загрузка состояния, клики по шагам,
 *     рендер, видео-модалка) без изменений.
 *
 *  Файл подключается ПОСЛЕ app.js и assistant.js и переопределяет глобальную
 *  функцию init(), на которую app.js уже зарегистрировал обработчик.
 * ========================================================================== */

function syncStepsUI() {
  var n = state.currentStep || 1;
  document.querySelectorAll('.step').forEach(function(el) {
    var s = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (s < n) el.classList.add('completed');
    if (s === n) el.classList.add('active');
  });
}

var uxFixesInitStarted = false;

function init() {
  if (uxFixesInitStarted) return;
  uxFixesInitStarted = true;

  loadState();
  syncStepsUI();

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

  renderCurrentStep();

  var closeBtn = document.getElementById('videoModalClose');
  var modal = document.getElementById('videoModal');
  if (closeBtn) closeBtn.addEventListener('click', closeVideoModal);
  if (modal) modal.addEventListener('click', function(e) { if (e.target === this) closeVideoModal(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}