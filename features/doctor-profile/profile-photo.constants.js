/** Public Supabase Storage bucket for doctor profile photos (migration 035). */
export const PROFILE_PHOTO = Object.freeze({
  BUCKET: "profile-photos",
  MAX_BYTES: 2 * 1024 * 1024,
  ALLOWED_MIME_TYPES: Object.freeze(["image/jpeg", "image/png", "image/webp"]),
  /**
   * @param {string} clinicId
   * @param {string} userId
   * @param {string} extension  e.g. "jpg"
   */
  buildPath(clinicId, userId, extension) {
    return `${clinicId}/${userId}/avatar.${extension}`;
  },
});
