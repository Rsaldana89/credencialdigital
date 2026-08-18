(() => {
  const form = document.getElementById('event-create-form');
  if (!form) return;

  const panel = document.getElementById('event-selected-panel');
  const filterInput = document.getElementById('event-employee-filter');
  const picker = document.getElementById('event-employee-picker');
  const selectVisibleButton = document.getElementById('event-select-visible');
  const clearButton = document.getElementById('event-clear-selection');
  const countLabel = document.getElementById('event-selection-count');
  const modeInputs = Array.from(form.querySelectorAll('input[name="invite_mode"]'));

  function employeeOptions() {
    return Array.from(picker?.querySelectorAll('.event-employee-option') || []);
  }

  function updateMode() {
    const selectedMode = modeInputs.find((input) => input.checked)?.value || 'ALL_ACTIVE';
    if (panel) panel.hidden = selectedMode !== 'SELECTED';
  }

  function updateCount() {
    if (!countLabel) return;
    const count = employeeOptions().filter((option) => option.querySelector('input[type="checkbox"]')?.checked).length;
    countLabel.textContent = `${count} ${count === 1 ? 'seleccionado' : 'seleccionados'}`;
  }

  function applyFilter() {
    const query = String(filterInput?.value || '').trim().toLocaleLowerCase('es-MX');
    employeeOptions().forEach((option) => {
      const haystack = option.textContent.toLocaleLowerCase('es-MX');
      option.hidden = Boolean(query) && !haystack.includes(query);
    });
  }

  modeInputs.forEach((input) => input.addEventListener('change', updateMode));
  filterInput?.addEventListener('input', applyFilter);
  picker?.addEventListener('change', updateCount);

  selectVisibleButton?.addEventListener('click', () => {
    employeeOptions().forEach((option) => {
      if (option.hidden) return;
      const checkbox = option.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = true;
    });
    updateCount();
  });

  clearButton?.addEventListener('click', () => {
    employeeOptions().forEach((option) => {
      const checkbox = option.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = false;
    });
    updateCount();
  });

  updateMode();
  updateCount();
})();
