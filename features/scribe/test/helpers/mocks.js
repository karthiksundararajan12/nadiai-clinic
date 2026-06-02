/** @typedef {import("../../models/session.model.js").RequestContext} RequestContext */

/** @returns {RequestContext} */
export function mockCtx(overrides = {}) {
  return {
    actorId:   "doctor-1",
    doctorId:  "doctor-1",
    clinicId:  "clinic-1",
    requestId: "req-1",
    ...overrides,
  };
}

/**
 * @param {Record<string, unknown>} session
 * @param {Record<string, unknown>} [handlers]
 */
export function mockSessionRepository(session, handlers = {}) {
  let current = { ...session };
  return {
    findById: async (id, doctorId) => {
      if (handlers.findById) return handlers.findById(id, doctorId, current);
      if (current.id !== id || current.doctor_id !== doctorId) return null;
      return { ...current };
    },
    transitionStatus: async (id, doctorId, from, to, extra = {}) => {
      if (handlers.transitionStatus) {
        return handlers.transitionStatus(id, doctorId, from, to, extra, current);
      }
      if (current.id !== id || current.status !== from) {
        const { SessionNotFoundError } = await import("../../errors.js");
        throw new SessionNotFoundError(id);
      }
      current = { ...current, status: to, ...extra };
      return { ...current };
    },
    get current() {
      return current;
    },
  };
}

/** @param {Record<string, unknown>} workspace */
export function mockReviewRepository(workspace) {
  return {
    getWorkspace: async () => ({ ...workspace }),
    updateSegment: async () => ({}),
    insertEdit: async () => ({}),
  };
}

export function mockAuditService() {
  return { log: async () => {} };
}
