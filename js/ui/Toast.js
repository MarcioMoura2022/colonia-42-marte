/**
 * ui/Toast.js
 * ---------------------------------------------------------------------------
 * Notificações temporárias no topo da tela. Máximo de 4 simultâneas para não
 * cobrir o mapa.
 */

import { icon } from './icons.js';

const ICON_BY_TYPE = {
  success: 'check',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

export class ToastManager {
  constructor(root) {
    this.root = root;
    this.items = [];
  }

  /**
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} type
   * @param {number} duration ms
   */
  show(message, type = 'info', duration = 3400) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${icon(ICON_BY_TYPE[type] ?? 'info', 15)}</span>
      <span>${message}</span>
    `;

    this.root.appendChild(toast);
    this.items.push(toast);

    while (this.items.length > 4) {
      this.remove(this.items[0]);
    }

    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  }

  remove(toast) {
    if (!toast) return;

    // Remove da lista imediatamente para que o limite de 4 funcione mesmo
    // antes do fim da animação de saída.
    this.items = this.items.filter((item) => item !== toast);

    if (!toast.isConnected) return;

    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 260);
  }

  clear() {
    for (const toast of [...this.items]) {
      toast.remove();
    }
    this.items = [];
  }
}
