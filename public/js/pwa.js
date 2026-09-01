(() => {
  'use strict';

  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function installElements() {
    return {
      wrapper: document.querySelector('[data-pwa-install-wrap]'),
      button: document.querySelector('[data-pwa-install]'),
      status: document.querySelector('[data-pwa-install-status]')
    };
  }

  function hideInstallUi(message) {
    const { wrapper, status } = installElements();
    if (status && message) status.textContent = message;
    if (wrapper) wrapper.hidden = true;
  }

  function showInstallUi() {
    if (isStandalone() || !deferredInstallPrompt) return;
    const { wrapper } = installElements();
    if (wrapper) wrapper.hidden = false;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (location.protocol !== 'https:' && !isLocalhost) return;

    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch (error) {
      // La aplicacion web sigue funcionando aunque el navegador no permita PWA.
      console.warn('No fue posible registrar la PWA:', error);
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallUi('Aplicacion instalada.');
  });

  document.addEventListener('DOMContentLoaded', () => {
    const { button } = installElements();

    if (isStandalone()) {
      hideInstallUi();
    }

    if (button) {
      button.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;

        button.disabled = true;
        try {
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          if (choice.outcome === 'accepted') {
            hideInstallUi('Instalacion aceptada.');
          } else {
            hideInstallUi();
          }
        } catch (error) {
          console.warn('No fue posible mostrar la instalacion PWA:', error);
        } finally {
          button.disabled = false;
        }
      });
    }

    showInstallUi();
    registerServiceWorker();
  });
})();
