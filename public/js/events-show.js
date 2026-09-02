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
  const credentialLink = document.getElementById('event-result-credential');
  const awardAlert = document.getElementById('event-award-alert');
  const awardAlertTitle = document.getElementById('event-award-alert-title');
  const awardAlertName = document.getElementById('event-award-alert-name');
  const awardAlertDetail = document.getElementById('event-award-alert-detail');
  const manualInput = document.getElementById('event-manual-search');
  const manualButton = document.getElementById('event-manual-search-button');
  const manualResults = document.getElementById('event-manual-results');
  const statInvited = document.getElementById('event-stat-invited');
  const statAttended = document.getElementById('event-stat-attended');
  const statPrizes = document.getElementById('event-stat-prizes');
  const statConsolations = document.getElementById('event-stat-consolations');
  const scannerSticky = document.querySelector('.event-scanner-sticky');
  const scannerCollapsible = document.getElementById('event-scanner-collapsible');
  const scannerToggleButton = document.getElementById('event-scanner-toggle');
  const scannerToggleLabel = document.getElementById('event-scanner-toggle-label');
  const jumpSearchButton = document.getElementById('event-jump-search');
  const jumpListButton = document.getElementById('event-jump-list');
  const manualSearchSection = document.getElementById('event-manual-search-section');
  const attendanceSection = document.getElementById('event-attendance-section');

  const tenureFilterDetails = document.getElementById('event-tenure-filter');
  const tenureFilterLabel = document.getElementById('event-tenure-filter-label');
  const tenureActiveTitle = document.getElementById('event-tenure-active-title');
  const tenureActiveCounts = document.getElementById('event-tenure-active-counts');
  const tenureSelectAllButton = document.getElementById('event-tenure-select-all');
  const tenureClearButton = document.getElementById('event-tenure-clear');
  const filteredXlsxLink = document.getElementById('event-export-filtered-xlsx');
  const filteredPdfLink = document.getElementById('event-export-filtered-pdf');
  const filterEmptyRow = document.getElementById('event-filter-empty-row');
  const tenureCheckboxes = [...document.querySelectorAll('[data-tenure-filter-code]')];
  const allTenureGroupCodes = String(root.dataset.allTenureGroups || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const tenureGroupLabels = new Map(tenureCheckboxes.map((checkbox) => [
    checkbox.value,
    checkbox.closest('.event-tenure-option')?.querySelector('.event-tenure-option__copy strong')?.textContent?.trim() || checkbox.value
  ]));
  const tenureFilterStorageKey = `chc-event-tenure-filter-${eventId}`;

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
  let audioContext = null;
  let lastSyncLogId = Number.parseInt(root.dataset.lastLogId || '0', 10) || 0;
  let syncBusy = false;
  let syncTimer = null;
  let manualSearchSequence = 0;
  let scannerWasActiveBeforeCollapse = false;
  let pendingInviteRefresh = false;
  const LIVE_SYNC_INTERVAL_MS = 30000;

  function ensureAudioReady() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    } catch (_) {
      return null;
    }
  }

  function playTone(frequency, startDelay = 0, duration = 0.09, volume = 0.16) {
    const context = ensureAudioReady();
    if (!context || context.state === 'closed') return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + startDelay;
      const stopAt = startAt + duration;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.02);
    } catch (_) {
      // El sonido es una ayuda; un fallo de audio no debe detener el escáner.
    }
  }

  function playScanFeedback(code, ok = true) {
    if (!ok) {
      playTone(220, 0, 0.16, 0.14);
      if (navigator.vibrate) navigator.vibrate([90, 55, 90]);
      return;
    }
    if (code === 'ALREADY_ATTENDED') {
      playTone(660, 0, 0.07, 0.14);
      playTone(880, 0.105, 0.09, 0.16);
      if (navigator.vibrate) navigator.vibrate([55, 45, 55]);
      return;
    }
    if (code === 'AWARD_DELIVERED') {
      playTone(880, 0, 0.07, 0.14);
      playTone(1175, 0.09, 0.11, 0.17);
      if (navigator.vibrate) navigator.vibrate(90);
      return;
    }
    playTone(880, 0, 0.1, 0.16);
    if (navigator.vibrate) navigator.vibrate(70);
  }

  function setScannerMessage(message, type = 'neutral') {
    if (!scannerMessage) return;
    scannerMessage.textContent = message;
    scannerMessage.classList.remove('event-scanner-message--success', 'event-scanner-message--danger');
    if (type === 'success') scannerMessage.classList.add('event-scanner-message--success');
    if (type === 'danger') scannerMessage.classList.add('event-scanner-message--danger');
  }

  function selectedTenureGroups() {
    return tenureCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value)
      .filter((code) => allTenureGroupCodes.includes(code));
  }

  function resetQrDebounce() {
    lastQrValue = '';
    lastQrAt = 0;
  }

  function saveTenureFilter() {
    try {
      window.sessionStorage.setItem(tenureFilterStorageKey, JSON.stringify(selectedTenureGroups()));
    } catch (_) {
      // La persistencia del filtro es auxiliar; la pantalla sigue funcionando sin sessionStorage.
    }
  }

  function restoreTenureFilter() {
    let stored = null;
    try {
      const raw = window.sessionStorage.getItem(tenureFilterStorageKey);
      if (raw !== null) stored = JSON.parse(raw);
    } catch (_) {
      stored = null;
    }

    if (!Array.isArray(stored)) {
      tenureCheckboxes.forEach((checkbox) => { checkbox.checked = true; });
      return;
    }

    const valid = new Set(stored.filter((code) => allTenureGroupCodes.includes(code)));
    tenureCheckboxes.forEach((checkbox) => { checkbox.checked = valid.has(checkbox.value); });
  }

  function describeSelectedTenureGroups(groups) {
    if (!groups.length) return 'Ningún rango';
    if (groups.length === allTenureGroupCodes.length) return 'Todos los rangos';
    if (groups.length === 1) return tenureGroupLabels.get(groups[0]) || groups[0];
    if (groups.length === 2) return groups.map((code) => tenureGroupLabels.get(code) || code).join(' y ');
    return `${groups.length} rangos seleccionados`;
  }

  function updateFilteredExportLinks(groups) {
    const params = new URLSearchParams();
    params.set('scope', 'filtered');
    if (groups.length) params.set('antiguedad', groups.join(','));
    const query = params.toString();
    if (filteredXlsxLink) filteredXlsxLink.href = `/admin/eventos/${encodeURIComponent(eventId)}/exportar.xlsx?${query}`;
    if (filteredPdfLink) filteredPdfLink.href = `/admin/eventos/${encodeURIComponent(eventId)}/exportar.pdf?${query}`;
  }

  function attendeeRows() {
    return [...document.querySelectorAll('.event-table tr[data-attendee-id]')];
  }

  function refreshTenureFilterView({ clearResultWhenOutside = true, rerunSearch = true } = {}) {
    const groups = selectedTenureGroups();
    const selected = new Set(groups);
    let visibleCount = 0;
    let attendedCount = 0;

    attendeeRows().forEach((row) => {
      const visible = selected.has(row.dataset.tenureGroup || '');
      row.hidden = !visible;
      if (!visible) return;
      visibleCount += 1;
      if (row.dataset.attended === '1') attendedCount += 1;
    });

    const label = describeSelectedTenureGroups(groups);
    if (tenureFilterLabel) tenureFilterLabel.textContent = label;
    if (tenureActiveTitle) tenureActiveTitle.textContent = label;
    if (tenureActiveCounts) {
      if (!groups.length) {
        tenureActiveCounts.textContent = 'Mostrando 0 invitados · selecciona al menos un rango para habilitar el escáner y la búsqueda';
      } else if (groups.length === allTenureGroupCodes.length) {
        tenureActiveCounts.textContent = `Mostrando ${visibleCount} invitado${visibleCount === 1 ? '' : 's'} · ${attendedCount} con asistencia`;
      } else {
        tenureActiveCounts.textContent = `Mostrando ${visibleCount} invitado${visibleCount === 1 ? '' : 's'} en la selección · ${attendedCount} con asistencia`;
      }
    }
    if (filterEmptyRow) filterEmptyRow.hidden = visibleCount > 0;
    updateFilteredExportLinks(groups);

    if (clearResultWhenOutside && currentResultAttendee && !selected.has(currentResultAttendee.tenureGroup)) {
      currentResultAttendee = null;
      hideAwardButtons();
      if (resultPanel) resultPanel.hidden = true;
    }

    if (rerunSearch && String(manualInput?.value || '').trim()) {
      runManualSearch(true);
    }
  }

  function setAllTenureGroups(checked) {
    tenureCheckboxes.forEach((checkbox) => { checkbox.checked = checked; });
    resetQrDebounce();
    saveTenureFilter();
    refreshTenureFilterView();
  }

  function setCameraButtons(active) {
    if (startButton) startButton.disabled = active || !isOpen;
    if (stopButton) stopButton.disabled = !active;
    if (!active && switchButton) switchButton.hidden = true;
  }

  function setCameraPlaceholderVisible(visible) {
    if (!cameraPlaceholder) return;
    cameraPlaceholder.hidden = !visible;
    cameraPlaceholder.classList.toggle('event-camera-placeholder--hidden', !visible);
    cameraPlaceholder.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function hideAwardButtons() {
    if (prizeButton) prizeButton.hidden = true;
    if (consolationButton) consolationButton.hidden = true;
  }

  function closeAwardAlert() {
    if (awardAlert) awardAlert.hidden = true;
  }

  function showAwardAlreadyDelivered(attendee) {
    if (!awardAlert || !attendee?.awardType) return;
    const isPrize = attendee.awardType === 'PREMIO';
    if (awardAlertTitle) awardAlertTitle.textContent = isPrize ? 'PREMIO YA ENTREGADO' : 'CONSOLACIÓN YA ENTREGADA';
    if (awardAlertName) awardAlertName.textContent = `${attendee.employeeNumber} · ${attendee.fullName}`;
    if (awardAlertDetail) {
      awardAlertDetail.textContent = attendee.awardDeliveredAt
        ? `Entrega registrada: ${attendee.awardDeliveredAt}`
        : 'La entrega ya se encuentra registrada en el evento.';
    }
    awardAlert.hidden = false;
    playTone(330, 0, 0.13, 0.16);
    playTone(245, 0.17, 0.18, 0.18);
    if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
  }

  function renderScanResult(attendee, message, code) {
    currentResultAttendee = attendee || null;
    if (!resultPanel) return;
    resultPanel.hidden = false;
    hideAwardButtons();
    if (credentialLink) {
      credentialLink.hidden = true;
      credentialLink.removeAttribute('href');
    }

    if (!attendee) {
      const outsideFilter = code === 'OUTSIDE_TENURE_FILTER';
      resultKicker.textContent = outsideFilter ? 'Fuera del filtro' : 'No registrado';
      resultName.textContent = outsideFilter
        ? 'No se encontró en la lista de antigüedad seleccionada'
        : 'No se pudo validar al empleado';
      resultMeta.textContent = '';
      resultStatus.textContent = message || '';
      return;
    }

    resultKicker.textContent = code === 'CHECKED_IN' ? 'Asistencia registrada' : 'Empleado identificado';
    resultName.textContent = `${attendee.employeeNumber} · ${attendee.fullName}`;
    if (credentialLink && attendee.publicCredentialUrl) {
      credentialLink.href = attendee.publicCredentialUrl;
      credentialLink.hidden = false;
    }
    resultMeta.textContent = `${attendee.puesto || 'Sin puesto'} · Antigüedad: ${attendee.tenure} · ${attendee.tenureGroupShortLabel || attendee.tenureGroupLabel || ''}`;

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
      resultStatus.textContent = `${resultStatus.textContent} Selecciona ahora el tipo de premio si corresponde.`;
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
    setScannerMessage('QR detectado. Validando credencial, invitación y antigüedad…');

    try {
      const payload = await postJson(`/admin/eventos/${encodeURIComponent(eventId)}/escanear`, {
        qr_value: normalizedValue,
        tenure_groups: selectedTenureGroups()
      });
      renderScanResult(payload.attendee, payload.message, payload.code);
      updateAttendeeRow(payload.attendee);
      setScannerMessage(payload.message || 'Asistencia validada.', 'success');
      playScanFeedback(payload.code, true);
      if (payload.attendee?.awardType) showAwardAlreadyDelivered(payload.attendee);
      window.setTimeout(syncLiveState, 80);
    } catch (error) {
      const message = error.payload?.message || error.message || 'No fue posible validar el QR.';
      renderScanResult(null, message, error.payload?.code);
      setScannerMessage(message, 'danger');
      playScanFeedback(error.payload?.code, false);
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
    if (name === 'VideoNotVisibleError') {
      return 'El navegador dio permiso a la cámara, pero no entregó imagen. Cierra otras apps que usen la cámara, recarga esta página y vuelve a intentar.';
    }
    return `No fue posible abrir la cámara${error?.message ? `: ${error.message}` : '.'} Revisa el permiso del sitio y vuelve a intentar.`;
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

  async function waitForVisibleVideo(timeoutMs = 7000) {
    if (!video) throw new Error('No existe el elemento de video del escáner.');
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return;

    await new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          finished = true;
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', done);
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('playing', done);
      };
      ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach((name) => video.addEventListener(name, done));
      window.setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      }, timeoutMs);
      done();
    });

    const track = stream?.getVideoTracks?.()[0];
    if (!track || track.readyState !== 'live') {
      const error = new Error('La cámara concedió permiso, pero el flujo de video no quedó activo.');
      error.name = 'NotReadableError';
      throw error;
    }
    if (!video.videoWidth || !video.videoHeight) {
      const error = new Error('La cámara abrió, pero el navegador no entregó imagen de video.');
      error.name = 'VideoNotVisibleError';
      throw error;
    }
  }

  async function attachStream(nextStream) {
    stream = nextStream;
    if (!video) throw new Error('No existe el elemento de video del escáner.');

    const track = stream?.getVideoTracks?.()[0];
    if (!track) {
      const error = new Error('El navegador no devolvió una pista de video.');
      error.name = 'NotReadableError';
      throw error;
    }

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;

    try {
      await video.play();
    } catch (error) {
      // En algunos móviles el primer play ocurre antes de que llegue metadata.
      await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
      await video.play();
    }

    await waitForVisibleVideo();
  }

  function currentCameraDescription() {
    const track = stream?.getVideoTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    const width = video?.videoWidth || settings.width || '';
    const height = video?.videoHeight || settings.height || '';
    const resolution = width && height ? ` · ${width}x${height}` : '';
    return `${track?.label || 'Cámara activa'}${resolution}`;
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
      setCameraPlaceholderVisible(false);
      setCameraButtons(true);
      await refreshCameraDevices();

      if (decoderMode === 'native') {
        setScannerMessage(`Cámara activa (${currentCameraDescription()}). Lector QR listo; coloca el código dentro del recuadro.`);
      } else if (decoderMode === 'jsqr') {
        setScannerMessage(`Cámara activa (${currentCameraDescription()}). Lector QR compatible listo; coloca el código dentro del recuadro.`);
      } else {
        setScannerMessage('La cámara está activa, pero no cargó el lector QR. Recarga la página; mientras tanto puedes usar la búsqueda manual.', 'danger');
      }
      scanFrame();
    } catch (error) {
      scanning = false;
      detectionBusy = false;
      releaseStream();
      setCameraPlaceholderVisible(true);
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
      setScannerMessage(`Cámara cambiada (${currentCameraDescription()}). Coloca el QR dentro del recuadro.`);
    } catch (error) {
      scanning = false;
      releaseStream();
      setCameraPlaceholderVisible(true);
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
    setCameraPlaceholderVisible(true);
    setCameraButtons(false);
    if (pendingInviteRefresh && !requestBusy) window.location.reload();
  }

  async function setScannerCollapsed(collapsed) {
    if (!scannerCollapsible || !scannerToggleButton || !scannerSticky) return;
    if (collapsed && scannerCollapsible.hidden) return;
    if (!collapsed && !scannerCollapsible.hidden) return;

    if (collapsed) {
      scannerWasActiveBeforeCollapse = scanning;
      if (scanning) stopCamera();
      scannerCollapsible.hidden = true;
      scannerSticky.classList.add('event-scanner-sticky--collapsed');
      scannerToggleButton.setAttribute('aria-expanded', 'false');
      if (scannerToggleLabel) scannerToggleLabel.textContent = 'Mostrar escáner';
      return;
    }

    scannerCollapsible.hidden = false;
    scannerSticky.classList.remove('event-scanner-sticky--collapsed');
    scannerToggleButton.setAttribute('aria-expanded', 'true');
    if (scannerToggleLabel) scannerToggleLabel.textContent = 'Ocultar escáner';

    const shouldResume = scannerWasActiveBeforeCollapse;
    scannerWasActiveBeforeCollapse = false;
    if (shouldResume && isOpen) await startCamera();
  }

  async function jumpToEventSection(section, { focusSearch = false } = {}) {
    if (!section) return;
    await setScannerCollapsed(true);
    window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (focusSearch && manualInput) {
        window.setTimeout(() => manualInput.focus({ preventScroll: true }), 350);
      }
    });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function appendCellText(cell, primaryText, secondaryText = '') {
    if (!cell) return;
    if (primaryText) cell.appendChild(createElement('span', '', primaryText));
    if (secondaryText) cell.appendChild(createElement('span', 'table-secondary', secondaryText));
  }

  function updateAttendeeRow(attendee, { refreshFilter = true } = {}) {
    if (!attendee?.id) return;
    const row = document.querySelector(`.event-table tr[data-attendee-id="${Number(attendee.id)}"]`);
    if (!row) return;

    row.dataset.attended = attendee.attended ? '1' : '0';
    row.dataset.awardType = attendee.awardType || '';
    if (attendee.tenureGroup) row.dataset.tenureGroup = attendee.tenureGroup;

    const tenureCell = row.querySelector('[data-role="tenure"]');
    if (tenureCell && attendee.tenureGroup) {
      tenureCell.replaceChildren();
      const badge = createElement(
        'span',
        `event-tenure-badge event-tenure-badge--${attendee.tenureGroupCssClass || 'unknown'}`,
        attendee.tenureGroupBadgeLabel || attendee.tenureGroupShortLabel || attendee.tenureGroupLabel
      );
      tenureCell.appendChild(badge);
      tenureCell.appendChild(createElement('strong', 'event-tenure-value', attendee.tenure || 'No disponible'));
      tenureCell.appendChild(createElement('span', 'table-secondary', `${attendee.employmentDateType === 'Reingreso' ? 'Reingreso' : 'Ingreso'}: ${attendee.startDate || 'No disponible'}`));
    }

    const attendanceCell = row.querySelector('[data-role="attendance"]');
    if (attendanceCell) {
      attendanceCell.replaceChildren();
      if (attendee.attended) {
        attendanceCell.appendChild(createElement('span', 'pill pill-success', 'Asistió'));
        const detail = [attendee.attendedAt || '', attendee.attendanceMethod || ''].filter(Boolean).join(' · ');
        if (detail) attendanceCell.appendChild(createElement('span', 'table-secondary', detail));
      } else if (isOpen) {
        const button = createElement('button', 'button button-primary button-small', 'Marcar asistencia');
        button.type = 'button';
        button.addEventListener('click', () => performAttendeeAction(attendee, 'checkin', null, 'LIST'));
        attendanceCell.appendChild(button);
      } else {
        attendanceCell.appendChild(createElement('span', 'pill pill-muted', 'No asistió'));
      }
    }

    if (!isFiesta) {
      if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      return;
    }
    const awardCell = row.querySelector('[data-role="award"]');
    if (!awardCell) {
      if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      return;
    }
    awardCell.replaceChildren();

    if (attendee.awardType === 'PREMIO') {
      awardCell.appendChild(createElement('span', 'pill pill-success', 'Premio entregado'));
      if (attendee.awardDeliveredAt) awardCell.appendChild(createElement('span', 'table-secondary', attendee.awardDeliveredAt));
      if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      return;
    }
    if (attendee.awardType === 'CONSOLACION') {
      awardCell.appendChild(createElement('span', 'pill pill-success', 'Consolación entregada'));
      if (attendee.awardDeliveredAt) awardCell.appendChild(createElement('span', 'table-secondary', attendee.awardDeliveredAt));
      if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      return;
    }
    if (!attendee.attended) {
      awardCell.appendChild(createElement('span', 'pill pill-muted', 'Requiere asistencia'));
      if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      return;
    }
    if (!isOpen) {
      awardCell.appendChild(createElement('span', 'pill pill-muted', 'Sin entrega'));
      if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      return;
    }

    const buttons = createElement('div', 'event-award-buttons');
    const prize = createElement('button', 'button button-primary button-small', 'Premio');
    prize.type = 'button';
    prize.addEventListener('click', () => performAttendeeAction(attendee, 'award', 'PREMIO', 'LIST'));
    const consolation = createElement('button', 'button button-secondary button-small', 'Consolación');
    consolation.type = 'button';
    consolation.addEventListener('click', () => performAttendeeAction(attendee, 'award', 'CONSOLACION', 'LIST'));
    buttons.append(prize, consolation);
    awardCell.appendChild(buttons);
    if (refreshFilter) refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
  }

  function updateLiveStats(event) {
    if (!event) return;
    if (statInvited) statInvited.textContent = String(event.invitedCount ?? 0);
    if (statAttended) statAttended.textContent = String(event.attendedCount ?? 0);
    if (statPrizes) statPrizes.textContent = String(event.prizeCount ?? 0);
    if (statConsolations) statConsolations.textContent = String(event.consolationCount ?? 0);
  }

  function localInviteCount() {
    return document.querySelectorAll('.event-table tr[data-attendee-id]').length;
  }

  function handleInviteCountChange(serverCount) {
    const expected = Number(serverCount || 0);
    if (!Number.isFinite(expected) || expected === localInviteCount()) return false;

    pendingInviteRefresh = true;
    if (!scanning && !requestBusy) {
      window.location.reload();
      return true;
    }

    setScannerMessage(
      'Se agregaron nuevos invitados desde otro dispositivo. Puedes seguir escaneando; la lista se recargará al ocultar o detener el escáner.',
      'success'
    );
    return false;
  }

  async function syncLiveState() {
    if (syncBusy || document.hidden) return;
    syncBusy = true;
    let repeatImmediately = false;
    try {
      const response = await fetch(
        `/admin/eventos/${encodeURIComponent(eventId)}/estado-vivo?desde=${encodeURIComponent(lastSyncLogId)}`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' }
      );
      const payload = await readJsonResponse(response);

      if (payload.event?.type !== eventType || payload.event?.status !== eventStatus) {
        window.location.reload();
        return;
      }

      updateLiveStats(payload.event);
      if (handleInviteCountChange(payload.event?.invitedCount)) return;
      const changedAttendees = Array.isArray(payload.attendees) ? payload.attendees : [];
      changedAttendees.forEach((attendee) => updateAttendeeRow(attendee, { refreshFilter: false }));
      if (changedAttendees.length) {
        refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });
      }

      if (currentResultAttendee?.id) {
        const changedCurrent = changedAttendees.find((attendee) => attendee.id === currentResultAttendee.id);
        if (changedCurrent) {
          renderScanResult(changedCurrent, 'Información actualizada desde la base de datos.', 'SYNC');
        }
      }

      lastSyncLogId = Math.max(lastSyncLogId, Number(payload.latestLogId || 0));
      repeatImmediately = Boolean(payload.hasMore);

      if (changedAttendees.length && String(manualInput?.value || '').trim()) {
        await runManualSearch(true);
      }
    } catch (_) {
      // La sincronización es auxiliar. Un fallo temporal no debe detener cámara ni captura.
    } finally {
      syncBusy = false;
    }

    if (repeatImmediately) window.setTimeout(syncLiveState, 0);
  }

  function startLiveSync() {
    if (syncTimer) window.clearInterval(syncTimer);
    syncTimer = window.setInterval(syncLiveState, LIVE_SYNC_INTERVAL_MS);
    window.setTimeout(syncLiveState, 500);
  }

  async function performAttendeeAction(attendee, action, awardType, source) {
    try {
      let payload;
      if (action === 'checkin') {
        payload = await postJson(
          `/admin/eventos/${encodeURIComponent(eventId)}/asistentes/${encodeURIComponent(attendee.id)}/asistencia`,
          { tenure_groups: selectedTenureGroups() }
        );
      } else {
        payload = await postJson(
          `/admin/eventos/${encodeURIComponent(eventId)}/asistentes/${encodeURIComponent(attendee.id)}/premio`,
          { award_type: awardType, source, tenure_groups: selectedTenureGroups() }
        );
      }
      setScannerMessage(payload.message || 'Cambio registrado.', 'success');
      updateAttendeeRow(payload.attendee);
      if (currentResultAttendee?.id === payload.attendee?.id) {
        renderScanResult(payload.attendee, payload.message, payload.code);
      }
      await runManualSearch(false);
      window.setTimeout(syncLiveState, 80);
    } catch (error) {
      const current = error.payload?.attendee;
      if (current) {
        updateAttendeeRow(current);
        if (currentResultAttendee?.id === current.id) {
          renderScanResult(current, error.payload?.message || error.message, error.payload?.code);
        }
      }
      setScannerMessage(error.payload?.message || error.message, 'danger');
      await runManualSearch(false);
      window.setTimeout(syncLiveState, 80);
    }
  }

  function buildManualResult(attendee) {
    const card = createElement('article', 'event-manual-result');
    const copy = createElement('div', 'event-manual-result__copy');
    copy.appendChild(createElement('strong', '', `${attendee.employeeNumber} · ${attendee.fullName}`));
    const tenureLine = createElement('span', 'event-manual-tenure');
    tenureLine.appendChild(createElement(
      'span',
      `event-tenure-badge event-tenure-badge--${attendee.tenureGroupCssClass || 'unknown'}`,
      attendee.tenureGroupBadgeLabel || attendee.tenureGroupShortLabel || attendee.tenureGroupLabel
    ));
    tenureLine.appendChild(document.createTextNode(` ${attendee.puesto || 'Sin puesto'} · ${attendee.tenure}`));
    copy.appendChild(tenureLine);

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
    if (attendee.publicCredentialUrl) {
      const credential = createElement('a', 'button button-secondary button-small', 'Ver credencial');
      credential.href = attendee.publicCredentialUrl;
      credential.target = '_blank';
      credential.rel = 'noopener noreferrer';
      actions.appendChild(credential);
    }
    if (!actions.children.length) {
      actions.appendChild(createElement('span', 'pill pill-muted', attendee.awardType ? 'Entrega cerrada' : attendee.attended ? 'Asistencia registrada' : 'Sin acciones'));
    }

    card.append(copy, actions);
    return card;
  }

  async function runManualSearch(silent = false) {
    if (!manualResults) return;
    const sequence = ++manualSearchSequence;
    const query = String(manualInput?.value || '').trim();
    if (!query) {
      manualResults.replaceChildren();
      return;
    }

    if (!silent) {
      manualResults.replaceChildren();
      manualResults.appendChild(createElement('p', 'muted', 'Buscando…'));
    }
    try {
      const params = new URLSearchParams({ q: query });
      const groups = selectedTenureGroups();
      if (groups.length) params.set('antiguedad', groups.join(','));
      else params.set('antiguedad', '');
      const response = await fetch(`/admin/eventos/${encodeURIComponent(eventId)}/buscar?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const payload = await readJsonResponse(response);
      if (sequence !== manualSearchSequence) return;
      manualResults.replaceChildren();
      if (!payload.attendees?.length) {
        manualResults.appendChild(createElement('p', 'muted', 'No se encontró un empleado dentro del filtro de antigüedad activo con ese criterio.'));
        return;
      }
      payload.attendees.forEach((attendee) => manualResults.appendChild(buildManualResult(attendee)));
    } catch (error) {
      if (sequence !== manualSearchSequence) return;
      manualResults.replaceChildren(createElement('p', 'muted', error.message || 'No fue posible realizar la búsqueda.'));
    }
  }

  async function deliverFromScan(awardType) {
    if (!currentResultAttendee?.id || !currentResultAttendee.canAward || requestBusy) return;
    requestBusy = true;
    if (prizeButton) prizeButton.disabled = true;
    if (consolationButton) consolationButton.disabled = true;
    setScannerMessage(awardType === 'PREMIO' ? 'Registrando Premio…' : 'Registrando Consolación…');
    try {
      const payload = await postJson(
        `/admin/eventos/${encodeURIComponent(eventId)}/asistentes/${encodeURIComponent(currentResultAttendee.id)}/premio`,
        { award_type: awardType, source: 'SCAN', tenure_groups: selectedTenureGroups() }
      );
      renderScanResult(payload.attendee, payload.message, payload.code);
      updateAttendeeRow(payload.attendee);
      setScannerMessage(payload.message || 'Premio registrado.', 'success');
      playScanFeedback('AWARD_DELIVERED', true);
      window.setTimeout(syncLiveState, 80);
    } catch (error) {
      const message = error.payload?.message || error.message;
      const current = error.payload?.attendee;
      if (current) {
        updateAttendeeRow(current);
        renderScanResult(current, message, error.payload?.code);
        if (current.awardType) showAwardAlreadyDelivered(current);
      } else {
        hideAwardButtons();
      }
      setScannerMessage(message, 'danger');
      playScanFeedback(error.payload?.code, false);
      window.setTimeout(syncLiveState, 80);
    } finally {
      requestBusy = false;
      if (prizeButton) prizeButton.disabled = false;
      if (consolationButton) consolationButton.disabled = false;
    }
  }

  document.querySelectorAll('[data-award-alert-close]').forEach((element) => {
    element.addEventListener('click', closeAwardAlert);
  });

  restoreTenureFilter();
  refreshTenureFilterView({ clearResultWhenOutside: false, rerunSearch: false });

  tenureCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      resetQrDebounce();
      saveTenureFilter();
      refreshTenureFilterView();
    });
  });
  tenureSelectAllButton?.addEventListener('click', () => setAllTenureGroups(true));
  tenureClearButton?.addEventListener('click', () => setAllTenureGroups(false));

  document.addEventListener('pointerdown', (event) => {
    if (!tenureFilterDetails?.open || tenureFilterDetails.contains(event.target)) return;
    tenureFilterDetails.removeAttribute('open');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tenureFilterDetails?.open) {
      tenureFilterDetails.removeAttribute('open');
    }
    if (event.key === 'Escape' && awardAlert && !awardAlert.hidden) closeAwardAlert();
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest?.('.event-row-action-form');
    if (!form) return;
    event.preventDefault();
    const row = form.closest('tr[data-attendee-id]');
    const attendeeId = Number(row?.dataset.attendeeId || 0);
    if (!attendeeId) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const action = form.dataset.action;
      const awardType = form.querySelector('input[name="award_type"]')?.value || null;
      const source = form.querySelector('input[name="source"]')?.value || 'LIST';
      await performAttendeeAction({ id: attendeeId }, action, awardType, source);
    } finally {
      if (submitButton?.isConnected) submitButton.disabled = false;
    }
  });

  setCameraPlaceholderVisible(true);
  setCameraButtons(false);

  scannerToggleButton?.addEventListener('click', async () => {
    const expanded = scannerToggleButton.getAttribute('aria-expanded') !== 'false';
    await setScannerCollapsed(expanded);
  });
  jumpSearchButton?.addEventListener('click', () => jumpToEventSection(manualSearchSection, { focusSearch: true }));
  jumpListButton?.addEventListener('click', () => jumpToEventSection(attendanceSection));

  startButton?.addEventListener('pointerdown', ensureAudioReady);
  startButton?.addEventListener('click', startCamera);
  switchButton?.addEventListener('click', switchCamera);
  stopButton?.addEventListener('click', stopCamera);
  prizeButton?.addEventListener('pointerdown', ensureAudioReady);
  consolationButton?.addEventListener('pointerdown', ensureAudioReady);
  prizeButton?.addEventListener('click', () => deliverFromScan('PREMIO'));
  consolationButton?.addEventListener('click', () => deliverFromScan('CONSOLACION'));
  manualButton?.addEventListener('click', () => runManualSearch(false));
  manualInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runManualSearch(false);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncLiveState();
  });
  startLiveSync();

  window.addEventListener('pagehide', () => {
    if (syncTimer) window.clearInterval(syncTimer);
    stopCamera();
  });
})();
