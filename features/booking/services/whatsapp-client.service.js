/**
 * @fileoverview Thin client for the Meta WhatsApp Cloud API "send message"
 * endpoint. Direct Meta Cloud API only (Interakt is out of scope for the
 * booking bot — see `clinics.interakt_*` columns, which this client never
 * reads).
 *
 * Auth model: per project decision, Meta auth is centralized in Nadi AI
 * (not per-doctor/per-clinic), so this client is constructed with a single
 * platform-level access token (WHATSAPP_ACCESS_TOKEN). `clinics.whatsapp_access_token_encrypted`
 * is legacy/unused by this client — see index.js factory notes.
 */

import { WHATSAPP_CONFIG } from "../constants.js";
import { WhatsAppCredentialsError, WhatsAppSendError } from "../errors.js";
import { createLogger } from "../logger.js";

const log = createLogger({ component: "WhatsAppClientService" });

export class WhatsAppClientService {
  /**
   * @param {{ accessToken: string; apiVersion?: string }} config
   */
  constructor({ accessToken, apiVersion = WHATSAPP_CONFIG.DEFAULT_API_VERSION } = {}) {
    if (!accessToken) {
      throw new WhatsAppCredentialsError(
        "WHATSAPP_ACCESS_TOKEN is not configured — cannot send WhatsApp messages",
      );
    }
    this._accessToken = accessToken;
    this._apiVersion  = apiVersion;
  }

  /**
   * @param {string} phoneNumberId
   * @param {Record<string, unknown>} body
   * @returns {Promise<any>}
   */
  async _post(phoneNumberId, body) {
    const url = `${WHATSAPP_CONFIG.GRAPH_BASE_URL}/${this._apiVersion}/${phoneNumberId}/messages`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this._accessToken}`,
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      });
    } catch (cause) {
      log.error("WhatsApp send request failed (network)", { phoneNumberId });
      throw new WhatsAppSendError("Failed to reach WhatsApp Cloud API", { cause: String(cause) });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      log.error("WhatsApp send request rejected", {
        phoneNumberId,
        status: response.status,
        error:  payload?.error,
      });
      throw new WhatsAppSendError(
        payload?.error?.message ?? `WhatsApp API responded with ${response.status}`,
        payload?.error ?? null,
      );
    }
    return payload;
  }

  /**
   * Sends a free-text message.
   *
   * @param {string} phoneNumberId
   * @param {string} toPhone
   * @param {string} body
   */
  async sendText(phoneNumberId, toPhone, body) {
    return this._post(phoneNumberId, {
      to: toPhone,
      type: "text",
      text: { body, preview_url: false },
    });
  }

  /**
   * Sends up to MAX_REPLY_BUTTONS quick-reply buttons.
   * Use sendInteractiveList when there are more than 3 options.
   *
   * @param {string} phoneNumberId
   * @param {string} toPhone
   * @param {{ bodyText: string; buttons: Array<{ id: string; title: string }> }} opts
   */
  async sendInteractiveButtons(phoneNumberId, toPhone, { bodyText, buttons }) {
    if (buttons.length > WHATSAPP_CONFIG.MAX_REPLY_BUTTONS) {
      throw new WhatsAppSendError(
        `Cannot send ${buttons.length} reply buttons — Meta caps interactive "button" messages at ${WHATSAPP_CONFIG.MAX_REPLY_BUTTONS}`,
      );
    }
    return this._post(phoneNumberId, {
      to: toPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map(({ id, title }) => ({
            type: "reply",
            reply: { id, title },
          })),
        },
      },
    });
  }

  /**
   * Sends an interactive list message (up to MAX_LIST_ROWS rows) — used for
   * the START-state intent menu since it has 4 options, exceeding Meta's
   * 3-button cap on the "button" interactive type.
   *
   * @param {string} phoneNumberId
   * @param {string} toPhone
   * @param {{ bodyText: string; buttonLabel: string; rows: Array<{ id: string; title: string; description?: string }> }} opts
   */
  async sendInteractiveList(phoneNumberId, toPhone, { bodyText, buttonLabel, rows }) {
    if (rows.length > WHATSAPP_CONFIG.MAX_LIST_ROWS) {
      throw new WhatsAppSendError(
        `Cannot send ${rows.length} list rows — Meta caps interactive "list" messages at ${WHATSAPP_CONFIG.MAX_LIST_ROWS}`,
      );
    }
    return this._post(phoneNumberId, {
      to: toPhone,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonLabel,
          sections: [{ rows }],
        },
      },
    });
  }
}
