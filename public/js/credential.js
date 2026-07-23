'use strict';

const printButton = document.querySelector('[data-print-credential]');
if (printButton) {
  printButton.addEventListener('click', () => {
    window.print();
  });
}
