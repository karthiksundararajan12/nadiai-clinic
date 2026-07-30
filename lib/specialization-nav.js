/**
 * @fileoverview Specialization-based dashboard nav visibility + route access.
 *
 * Pediatric matching uses the same `/pa?ediatric/i` heuristic as
 * VaccinationSeedingService (features/vaccinations/vaccination-seeding.service.js).
 * Keep these in sync if the seeding gate ever changes.
 *
 * Items listed in NAV_SPECIALIZATION_REQUIREMENTS are only shown/accessible
 * when the doctor's specialization matches the given pattern. Everything else
 * stays visible to all specializations.
 */

/** @type {RegExp} */
export const PEDIATRIC_SPECIALIZATION_PATTERN = /pa?ediatric/i;

/**
 * Nav item href → required specialization pattern.
 * Nested paths under an href (e.g. /vaccinations/new) inherit the same gate.
 *
 * @type {Readonly<Record<string, RegExp>>}
 */
export const NAV_SPECIALIZATION_REQUIREMENTS = Object.freeze({
  "/vaccinations": PEDIATRIC_SPECIALIZATION_PATTERN,
});

/**
 * @param {string|null|undefined} specialization
 * @param {RegExp} pattern
 * @returns {boolean}
 */
export function matchesSpecialization(specialization, pattern) {
  return Boolean(specialization && pattern.test(String(specialization)));
}

/**
 * @param {string|null|undefined} specialization
 * @returns {boolean}
 */
export function isPediatricSpecialization(specialization) {
  return matchesSpecialization(specialization, PEDIATRIC_SPECIALIZATION_PATTERN);
}

/**
 * @param {string} href Nav item root href (e.g. "/vaccinations")
 * @param {string|null|undefined} specialization
 * @returns {boolean}
 */
export function canAccessNavItem(href, specialization) {
  const requirement = NAV_SPECIALIZATION_REQUIREMENTS[href];
  if (!requirement) return true;
  return matchesSpecialization(specialization, requirement);
}

/**
 * Whether a full pathname (including nested routes) is allowed for this
 * doctor's specialization. Used by route guards for direct URL access.
 *
 * @param {string} pathname
 * @param {string|null|undefined} specialization
 * @returns {boolean}
 */
export function canAccessPath(pathname, specialization) {
  for (const [href, pattern] of Object.entries(NAV_SPECIALIZATION_REQUIREMENTS)) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return matchesSpecialization(specialization, pattern);
    }
  }
  return true;
}

/**
 * @template {{ href: string }} T
 * @param {ReadonlyArray<T>} navItems
 * @param {string|null|undefined} specialization
 * @returns {T[]}
 */
export function filterNavItems(navItems, specialization) {
  return navItems.filter((item) => canAccessNavItem(item.href, specialization));
}
