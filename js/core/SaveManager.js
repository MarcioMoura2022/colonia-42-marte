/**
 * core/SaveManager.js
 * ---------------------------------------------------------------------------
 * Persistência em localStorage. O save guarda apenas dados (edifícios,
 * recursos, população); a simulação é reconstruída a partir disso.
 */

import { SAVE_KEY, SAVE_VERSION } from '../config.js';

export const SaveManager = {
  /**
   * @param {import('./Colony.js').Colony} colony
   * @returns {boolean}
   */
  save(colony) {
    try {
      const data = colony.serialize();
      data.version = SAVE_VERSION;
      data.savedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn('[Colônia 42] Não foi possível salvar o progresso:', error);
      return false;
    }
  },

  /** @returns {object|null} */
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;

      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (data.version !== SAVE_VERSION) {
        console.info('[Colônia 42] Save de versão antiga ignorado.');
        return null;
      }
      return data;
    } catch (error) {
      console.warn('[Colônia 42] Save corrompido:', error);
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* localStorage indisponível (modo privado) */
    }
  },

  /** Informações leves para exibir na ajuda. */
  info() {
    const data = this.load();
    if (!data) return null;
    return {
      savedAt: data.savedAt ?? null,
      elapsed: data.elapsed ?? 0,
      population: data.population ?? 0,
      buildings: Array.isArray(data.buildings) ? data.buildings.length : 0,
    };
  },
};
