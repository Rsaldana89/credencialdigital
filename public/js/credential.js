'use strict';

const printButton = document.querySelector('[data-print-credential]');
if (printButton) {
  printButton.addEventListener('click', () => {
    window.print();
  });
}

const downloadButton = document.querySelector('[data-download-credential]');

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'CREDENCIAL_QR.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

if (downloadButton) {
  downloadButton.addEventListener('click', async () => {
    const downloadUrl = String(downloadButton.dataset.downloadUrl || '').trim();
    const filename = String(downloadButton.dataset.downloadName || 'CREDENCIAL_QR.png').trim();
    if (!downloadUrl) return;

    const originalText = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Generando credencial…';

    try {
      const response = await fetch(downloadUrl, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'image/png' }
      });
      if (!response.ok) throw new Error(`No fue posible descargar la credencial (${response.status}).`);
      downloadBlob(await response.blob(), filename);
    } catch (error) {
      console.error('No fue posible descargar la credencial:', error);
      // Respaldo para navegadores que no permitan fetch/Blob.
      const fallback = document.createElement('a');
      fallback.href = downloadUrl;
      fallback.download = filename;
      document.body.appendChild(fallback);
      fallback.click();
      fallback.remove();
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = originalText;
    }
  });
}
