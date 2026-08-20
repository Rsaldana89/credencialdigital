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
  const switchButton = document.getElementById('event-switch-camera');
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

  const scanCanvas = document.createElement('canvas');
  const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });

  let stream = null;
  let detector = null;
  let decoderMode = null;
  let scanning = false;
  let detectionBusy = false;
  let requestBusy = false;
  let cameraDevices = [];
  let activeCameraId = '';
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
    if (!active && switchButton) switchButton.hidden = true;
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
    const normalizedValue = String(rawValue).trim();
    if (!normalizedValue) return;

    const now = Date.now();
    if (normalizedValue === lastQrValue && now - lastQrAt < 2800) return;
    lastQrValue = normalizedValue;
    lastQrAt = now;
    requestBusy = true;
    setScannerMessage('QR detectado. Validando credencial e invitación…');

    try {
      const payload = await postJson(`/admin/eventos/${encodeURIComponent(eventId)}/escanear`, {
        qr_value: normalizedValue
      });
      renderScanResult(payload.attendee, payload.message, payload.code);
      setScannerMessage(payload.message || 'Asistencia validada.', 'success');
      if (navigator.vibrate) navigator.vibrate(70);
    } catch (error) {
      const message = error.payload?.message || error.message || 'No fue posible validar el QR.';
      renderScanResult(null, message, error.payload?.code);
      setScannerMessage(message, 'danger');
    } finally {
      requestBusy = false;
    }
  }

  async function initializeDecoder() {
    detector = null;
    decoderMode = null;

    if ('BarcodeDetector' in window) {
      try {
        const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function'
          ? await window.BarcodeDetector.getSupportedFormats()
          : ['qr_code'];
        if (!supported.length || supported.includes('qr_code')) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          decoderMode = 'native';
          return;
        }
      } catch (_) {
        detector = null;
      }
    }

    if (typeof window.jsQR === 'function' && scanContext) {
      decoderMode = 'jsqr';
    }
  }

  function readQrWithJsQr() {
    if (!video || !scanContext || typeof window.jsQR !== 'function') return null;
    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return null;

    // Limitar el tamaño reduce CPU en celulares sin perder suficiente detalle para un QR de credencial.
    const maxDimension = 960;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    if (scanCanvas.width !== width) scanCanvas.width = width;
    if (scanCanvas.height !== height) scanCanvas.height = height;

    scanContext.drawImage(video, 0, 0, width, height);
    const imageData = scanContext.getImageData(0, 0, width, height);
    const code = window.jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
    return code?.data || null;
  }

  async function scanFrame() {
    if (!scanning) return;

    if (!detectionBusy && video && video.readyState >= 2 && decoderMode) {
      detectionBusy = true;
      try {
        let rawValue = null;
        if (decoderMode === 'native' && detector) {
          const codes = await detector.detect(video);
          const qr = codes.find((code) => code.rawValue);
          rawValue = qr?.rawValue || null;
        } else if (decoderMode === 'jsqr') {
          rawValue = readQrWithJsQr();
        }
        if (rawValue) await handleQrValue(rawValue);
      } catch (_) {
        // Un frame puede fallar por movimiento, enfoque o cambio de cámara; se intenta de nuevo.
      } finally {
        detectionBusy = false;
      }
    }

    window.setTimeout(scanFrame, decoderMode === 'jsqr' ? 260 : 180);
  }

  function releaseStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  function cameraErrorMessage(error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'El navegador bloqueó el permiso de cámara. Abre el candado o ajustes del sitio, permite Cámara y vuelve a pulsar “Activar cámara”.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No se encontró una cámara disponible en este dispositivo.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'La cámara está ocupada o no pudo iniciarse. Cierra otras apps que usen la cámara y vuelve a intentar.';
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return 'No fue posible usar la cámara seleccionada. Intenta de nuevo para usar otra cámara disponible.';
    }
    return 'No fue posible abrir la cámara. Revisa el permiso del sitio y vuelve a intentar.';
  }

  async function requestCameraStream(deviceId = '') {
    const videoConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      : {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
    } catch (error) {
      // Si el usuario negó el permiso, no hacemos una segunda petición que no podrá resolverlo.
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
      // Fallback muy compatible para webcams/telefonos que no aceptan facingMode o resolución ideal.
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
  }

  async function refreshCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      cameraDevices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'videoinput');

      const currentTrack = stream?.getVideoTracks?.()[0];
      const settings = currentTrack?.getSettings?.() || {};
      activeCameraId = settings.deviceId || activeCameraId;

      if (switchButton) {
        switchButton.hidden = cameraDevices.length < 2;
        switchButton.disabled = cameraDevices.length < 2 || !scanning;
      }
    } catch (_) {
      cameraDevices = [];
      if (switchButton) switchButton.hidden = true;
    }
  }

  async function attachStream(nextStream) {
    stream = nextStream;
    if (!video) throw new Error('No existe el elemento de video del escáner.');

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    if (video.readyState < 1) {
      await new Promise((resolve) => {
        const done = () => resolve();
        video.addEventListener('loadedmetadata', done, { once: true });
        window.setTimeout(done, 1500);
      });
    }
    await video.play();
  }

  async function startCamera() {
    if (!isOpen || scanning) return;
    if (!window.isSecureContext) {
      setScannerMessage('La cámara requiere HTTPS. Abre la versión segura https:// de este sitio.', 'danger');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('Este navegador no ofrece acceso a cámara. Actualiza el navegador o usa la búsqueda manual.', 'danger');
      return;
    }

    setScannerMessage('Solicitando acceso a la cámara…');
    if (startButton) startButton.disabled = true;

    try {
      // IMPORTANTE: pedir la cámara ocurre ANTES de comprobar BarcodeDetector.
      // Así el permiso sí aparece incluso en navegadores sin lector QR nativo.
      const nextStream = await requestCameraStream();
      await attachStream(nextStream);
      await initializeDecoder();

      scanning = true;
      if (cameraPlaceholder) cameraPlaceholder.hidden = true;
      setCameraButtons(true);
      await refreshCameraDevices();

      if (decoderMode === 'native') {
        setScannerMessage('Cámara activa. Lector QR listo; coloca el código dentro del recuadro.');
      } else if (decoderMode === 'jsqr') {
        setScannerMessage('Cámara activa. Lector QR compatible listo; coloca el código dentro del recuadro.');
      } else {
        setScannerMessage('La cámara está activa, pero no cargó el lector QR. Recarga la página; mientras tanto puedes usar la búsqueda manual.', 'danger');
      }
      scanFrame();
    } catch (error) {
      scanning = false;
      detectionBusy = false;
      releaseStream();
      if (cameraPlaceholder) cameraPlaceholder.hidden = false;
      setCameraButtons(false);
      setScannerMessage(cameraErrorMessage(error), 'danger');
    } finally {
      if (startButton && !scanning) startButton.disabled = !isOpen;
    }
  }

  async function switchCamera() {
    if (!scanning || cameraDevices.length < 2) return;
    const currentIndex = Math.max(0, cameraDevices.findIndex((device) => device.deviceId === activeCameraId));
    const nextDevice = cameraDevices[(currentIndex + 1) % cameraDevices.length];
    if (!nextDevice?.deviceId) return;

    detectionBusy = true;
    if (switchButton) switchButton.disabled = true;
    setScannerMessage('Cambiando cámara…');

    try {
      releaseStream();
      const nextStream = await requestCameraStream(nextDevice.deviceId);
      await attachStream(nextStream);
      activeCameraId = nextDevice.deviceId;
      await refreshCameraDevices();
      setScannerMessage('Cámara cambiada. Coloca el QR dentro del recuadro.');
    } catch (error) {
      scanning = false;
      releaseStream();
      if (cameraPlaceholder) cameraPlaceholder.hidden = false;
      setCameraButtons(false);
      setScannerMessage(cameraErrorMessage(error), 'danger');
    } finally {
      detectionBusy = false;
      if (switchButton && scanning) switchButton.disabled = cameraDevices.length < 2;
    }
  }

  function stopCamera() {
    scanning = false;
    detectionBusy = false;
    detector = null;
    decoderMode = null;
    cameraDevices = [];
    activeCameraId = '';
    releaseStream();
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
  switchButton?.addEventListener('click', switchCamera);
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
