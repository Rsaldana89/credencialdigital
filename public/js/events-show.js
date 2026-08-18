(() => {
  const root = document.getElementById('event-live-root');
  if (!root) return;

  const eventId = root.dataset.eventId;
  const eventType = root.dataset.eventType;
  const eventStatus = root.dataset.eventStatus;
  const csrf = root.dataset.csrf;
  const isFiesta = eventType === 'FIESTA_PREMIOS';
  const isOpen = eventStatus === 'OPEN';

  const video = document.getElementById('event-scanner-video');
  const cameraPlaceholder = document.getElementById('event-camera-placeholder');
  const startButton = document.getElementById('event-start-camera');
  const stopButton = document.getElementById('event-stop-camera');
  const scannerMessage = document.getElementById('event-scanner-message');
  const resultPanel = document.getElementById('event-scan-result');
  const resultKicker = document.getElementById('event-result-kicker');
  const resultName = document.getElementById('event-result-name');
  const resultMeta = document.getElementById('event-result-meta');
  const resultStatus = document.getElementById('event-result-status');
  const prizeButton = document.getElementById('event-result-prize');
  const consolationButton = document.getElementById('event-result-consolation');
  const manualInput = document.getElementById('event-manual-search');
  const manualButton = document.getElementById('event-manual-search-button');
  const manualResults = document.getElementById('event-manual-results');

  let stream = null;
  let detector = null;
  let scanning = false;
  let detectionBusy = false;
  let requestBusy = false;
  let lastQrValue = '';
  let lastQrAt = 0;
  let currentResultAttendee = null;

  function setScannerMessage(message, type = 'neutral') {
    if (!scannerMessage) return;
    scannerMessage.textContent = message;
    scannerMessage.classList.remove('event-scanner-message--success', 'event-scanner-message--danger');
    if (type === 'success') scannerMessage.classList.add('event-scanner-message--success');
    if (type === 'danger') scannerMessage.classList.add('event-scanner-message--danger');
  }

  function setCameraButtons(active) {
    if (startButton) startButton.disabled = active || !isOpen;
    if (stopButton) stopButton.disabled = !active;
  }

  function hideAwardButtons() {
    if (prizeButton) prizeButton.hidden = true;
    if (consolationButton) consolationButton.hidden = true;
  }

  function renderScanResult(attendee, message, code) {
    currentResultAttendee = attendee || null;
    if (!resultPanel) return;
    resultPanel.hidden = false;
    hideAwardButtons();

    if (!attendee) {
      resultKicker.textContent = 'No registrado';
      resultName.textContent = 'No se pudo validar al empleado';
      resultMeta.textContent = '';
      resultStatus.textContent = message || '';
      return;
    }

    resultKicker.textContent = code === 'CHECKED_IN' ? 'Asistencia registrada' : 'Empleado identificado';
    resultName.textContent = `${attendee.employeeNumber} · ${attendee.fullName}`;
    resultMeta.textContent = `${attendee.puesto || 'Sin puesto'} · Antigüedad: ${attendee.tenure}`;

    if (attendee.awardType === 'PREMIO') {
      resultStatus.textContent = `Asistió. Premio entregado${attendee.awardDeliveredAt ? ` · ${attendee.awardDeliveredAt}` : ''}.`;
    } else if (attendee.awardType === 'CONSOLACION') {
      resultStatus.textContent = `Asistió. Premio de consolación entregado${attendee.awardDeliveredAt ? ` · ${attendee.awardDeliveredAt}` : ''}.`;
    } else if (attendee.attended) {
      resultStatus.textContent = message || `Asistencia: ${attendee.attendedAt || 'registrada'}.`;
    } else {
      resultStatus.textContent = message || 'Sin asistencia registrada.';
    }

    if (isFiesta && attendee.canAward) {
      if (prizeButton) prizeButton.hidden = false;
      if (consolationButton) consolationButton.hidden = false;
    }
  }

  async function readJsonResponse(response) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = { ok: false, message: 'El servidor devolvió una respuesta no válida.' };
    }
    if (!response.ok) {
      const error = new Error(payload.message || 'No fue posible completar la operación.');
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-csrf-token': csrf
      },
      body: JSON.stringify(body || {})
    });
    return readJsonResponse(response);
  }

  async function handleQrValue(rawValue) {
    if (!rawValue || requestBusy) return;
    const now = Date.now();
    if (rawValue === lastQrValue && now - lastQrAt < 2800) return;
    lastQrValue = rawValue;
    lastQrAt = now;
    requestBusy = true;
    setScannerMessage('QR detectado. Validando credencial e invitación…');

    try {
      const payload = await postJson(`/admin/eventos/${encodeURIComponent(eventId)}/escanear`, {
        qr_value: rawValue
      });
      renderScanResult(payload.attendee, payload.message, payload.code);
      setScannerMessage(payload.message || 'Asistencia validada.', 'success');
    } catch (error) {
      const message = error.payload?.message || error.message || 'No fue posible validar el QR.';
      renderScanResult(null, message, error.payload?.code);
      setScannerMessage(message, 'danger');
    } finally {
      requestBusy = false;
    }
  }

  async function scanFrame() {
    if (!scanning) return;
    if (!detectionBusy && detector && video && video.readyState >= 2) {
      detectionBusy = true;
      try {
        const codes = await detector.detect(video);
        const qr = codes.find((code) => code.rawValue);
        if (qr?.rawValue) await handleQrValue(qr.rawValue);
      } catch (_) {
        // Un frame puede fallar por movimiento o enfoque; el siguiente se intenta normalmente.
      } finally {
        detectionBusy = false;
      }
    }
    window.setTimeout(scanFrame, 220);
  }

  async function startCamera() {
    if (!isOpen || scanning) return;
    if (!window.isSecureContext) {
      setScannerMessage('La cámara del navegador requiere HTTPS. Usa la búsqueda manual en esta sesión.', 'danger');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('Este navegador no permite acceso a cámara. Usa la búsqueda manual.', 'danger');
      return;
    }
    if (!('BarcodeDetector' in window)) {
      setScannerMessage('Este navegador no incluye lector QR nativo. Abre esta página en Chrome o Edge actualizado, o usa la búsqueda manual.', 'danger');
      return;
    }

    try {
      const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function'
        ? await window.BarcodeDetector.getSupportedFormats()
        : ['qr_code'];
      if (supported.length && !supported.includes('qr_code')) {
        setScannerMessage('El lector de este navegador no soporta códigos QR. Usa la búsqueda manual.', 'danger');
        return;
      }

      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      video.srcObject = stream;
      await video.play();
      scanning = true;
      if (cameraPlaceholder) cameraPlaceholder.hidden = true;
      setCameraButtons(true);
      setScannerMessage('Cámara activa. Coloca el QR de la credencial dentro del recuadro.');
      scanFrame();
    } catch (error) {
      stopCamera();
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setScannerMessage(
        denied
          ? 'No se autorizó el uso de la cámara. Puedes continuar con la búsqueda manual.'
          : 'No fue posible abrir la cámara. Puedes continuar con la búsqueda manual.',
        'danger'
      );
    }
  }

  function stopCamera() {
    scanning = false;
    detectionBusy = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (cameraPlaceholder) cameraPlaceholder.hidden = false;
    setCameraButtons(false);
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  async function performAttendeeAction(attendee, action, awardType, source) {
    try {
      let payload;
      if (action === 'checkin') {
        payload = await postJson(
          `/admin/eventos/${encodeURIComponent(eventId)}/asistentes/${encodeURIComponent(attendee.id)}/asistencia`,
          {}
        );
      } else {
        payload = await postJson(
          `/admin/eventos/${encodeURIComponent(eventId)}/asistentes/${encodeURIComponent(attendee.id)}/premio`,
          { award_type: awardType, source }
        );
      }
      setScannerMessage(payload.message || 'Cambio registrado.', 'success');
      if (currentResultAttendee?.id === payload.attendee?.id) {
        renderScanResult(payload.attendee, payload.message, payload.code);
      }
      await runManualSearch();
    } catch (error) {
      setScannerMessage(error.payload?.message || error.message, 'danger');
      await runManualSearch();
    }
  }

  function buildManualResult(attendee) {
    const card = createElement('article', 'event-manual-result');
    const copy = createElement('div', 'event-manual-result__copy');
    copy.appendChild(createElement('strong', '', `${attendee.employeeNumber} · ${attendee.fullName}`));
    copy.appendChild(createElement('span', '', `${attendee.puesto || 'Sin puesto'} · Antigüedad: ${attendee.tenure}`));

    const statusParts = [];
    statusParts.push(attendee.attended ? `Asistió${attendee.attendedAt ? `: ${attendee.attendedAt}` : ''}` : 'Sin asistencia');
    if (attendee.awardType === 'PREMIO') statusParts.push('Premio entregado');
    if (attendee.awardType === 'CONSOLACION') statusParts.push('Consolación entregada');
    copy.appendChild(createElement('span', '', statusParts.join(' · ')));

    const actions = createElement('div', 'event-manual-result__actions');
    if (attendee.canCheckIn) {
      const button = createElement('button', 'button button-primary button-small', 'Marcar asistencia');
      button.type = 'button';
      button.addEventListener('click', () => performAttendeeAction(attendee, 'checkin', null, 'SEARCH'));
      actions.appendChild(button);
    }
    if (isFiesta && attendee.canAward) {
      const prize = createElement('button', 'button button-primary button-small', 'Premio');
      prize.type = 'button';
      prize.addEventListener('click', () => performAttendeeAction(attendee, 'award', 'PREMIO', 'SEARCH'));
      const consolation = createElement('button', 'button button-secondary button-small', 'Consolación');
      consolation.type = 'button';
      consolation.addEventListener('click', () => performAttendeeAction(attendee, 'award', 'CONSOLACION', 'SEARCH'));
      actions.append(prize, consolation);
    }
    if (!actions.children.length) {
      actions.appendChild(createElement('span', 'pill pill-muted', attendee.awardType ? 'Entrega cerrada' : attendee.attended ? 'Asistencia registrada' : 'Sin acciones'));
    }

    card.append(copy, actions);
    return card;
  }

  async function runManualSearch() {
    if (!manualResults) return;
    const query = String(manualInput?.value || '').trim();
    manualResults.replaceChildren();
    if (!query) return;

    manualResults.appendChild(createElement('p', 'muted', 'Buscando…'));
    try {
      const response = await fetch(`/admin/eventos/${encodeURIComponent(eventId)}/buscar?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await readJsonResponse(response);
      manualResults.replaceChildren();
      if (!payload.attendees?.length) {
        manualResults.appendChild(createElement('p', 'muted', 'No se encontró un empleado invitado con ese criterio.'));
        return;
      }
      payload.attendees.forEach((attendee) => manualResults.appendChild(buildManualResult(attendee)));
    } catch (error) {
      manualResults.replaceChildren(createElement('p', 'muted', error.message || 'No fue posible realizar la búsqueda.'));
    }
  }

  async function deliverFromScan(awardType) {
    if (!currentResultAttendee?.id || !currentResultAttendee.canAward) return;
    try {
      const payload = await postJson(
        `/admin/eventos/${encodeURIComponent(eventId)}/asistentes/${encodeURIComponent(currentResultAttendee.id)}/premio`,
        { award_type: awardType, source: 'SCAN' }
      );
      renderScanResult(payload.attendee, payload.message, payload.code);
      setScannerMessage(payload.message || 'Premio registrado.', 'success');
    } catch (error) {
      const message = error.payload?.message || error.message;
      setScannerMessage(message, 'danger');
      hideAwardButtons();
    }
  }

  startButton?.addEventListener('click', startCamera);
  stopButton?.addEventListener('click', stopCamera);
  prizeButton?.addEventListener('click', () => deliverFromScan('PREMIO'));
  consolationButton?.addEventListener('click', () => deliverFromScan('CONSOLACION'));
  manualButton?.addEventListener('click', runManualSearch);
  manualInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runManualSearch();
    }
  });

  window.addEventListener('pagehide', stopCamera);
})();
