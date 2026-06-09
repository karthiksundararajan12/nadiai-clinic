/**
 * @fileoverview Advanced transcript editing utilities with undo/redo and batch operations
 */

/**
 * EditorHistory manages undo/redo for transcript edits
 */
export class EditorHistory {
  constructor(maxSteps = 50) {
    this.maxSteps = maxSteps;
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Add a change to the history
   * @param {Object} change - { segmentId, before: string, after: string }
   */
  push(change) {
    // Remove any redo history
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    this.history.push(change);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxSteps) {
      this.history = this.history.slice(-this.maxSteps);
      this.currentIndex = this.history.length - 1;
    }
  }

  /**
   * Undo the last change
   * @returns {Object|null} The change that was undone
   */
  undo() {
    if (this.currentIndex < 0) return null;
    const change = this.history[this.currentIndex];
    this.currentIndex--;
    return change;
  }

  /**
   * Redo the last undone change
   * @returns {Object|null} The change that was redone
   */
  redo() {
    if (this.currentIndex >= this.history.length - 1) return null;
    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  /**
   * Check if undo is possible
   */
  canUndo() {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear history
   */
  clear() {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get current state as a list of all edits
   */
  getState() {
    return this.history.slice(0, this.currentIndex + 1);
  }
}

/**
 * Advanced text matching and correction for transcript edits
 */
export class TranscriptMatcher {
  /**
   * Find segments matching a pattern
   * @param {Array} segments - Transcript segments
   * @param {string|RegExp} pattern - Search pattern
   * @returns {Array} Matching segment IDs
   */
  static findMatching(segments, pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
    return segments
      .filter((s) => regex.test(s.text))
      .map((s) => s.id);
  }

  /**
   * Find segments by speaker
   * @param {Array} segments - Transcript segments
   * @param {string} speaker - Speaker key (e.g., 'A', 'B')
   * @returns {Array} Matching segment IDs
   */
  static findBySpeaker(segments, speaker) {
    return segments
      .filter((s) => s.speaker === speaker)
      .map((s) => s.id);
  }

  /**
   * Find segments with low confidence
   * @param {Array} segments - Transcript segments
   * @param {number} threshold - Confidence threshold (0-1)
   * @returns {Array} Matching segment IDs
   */
  static findLowConfidence(segments, threshold = 0.7) {
    return segments
      .filter((s) => s.confidence < threshold)
      .map((s) => s.id);
  }

  /**
   * Find similar segments (for batch correction)
   * @param {Array} segments - Transcript segments
   * @param {string} text - Text to find similar segments for
   * @param {number} similarity - Similarity threshold (0-1)
   * @returns {Array} Matching segment IDs
   */
  static findSimilar(segments, text, similarity = 0.7) {
    const query = text.toLowerCase();
    const matches = [];

    segments.forEach((segment) => {
      const segText = (segment.text || "").toLowerCase();
      const score = calculateSimilarity(query, segText);
      if (score >= similarity) {
        matches.push({ id: segment.id, score });
      }
    });

    return matches.sort((a, b) => b.score - a.score).map((m) => m.id);
  }
}

/**
 * Batch operations for transcript editing
 */
export class BatchEditor {
  /**
   * Find and replace in multiple segments
   * @param {Array} segments - Transcript segments
   * @param {string|RegExp} find - Pattern to find
   * @param {string|Function} replace - Replacement (string or function)
   * @param {Array} segmentIds - IDs to limit replacement to
   * @returns {Array} Changes made
   */
  static findAndReplace(segments, find, replace, segmentIds = null) {
    const changes = [];
    const pattern = find instanceof RegExp ? find : new RegExp(find, "g");

    segments.forEach((segment) => {
      if (segmentIds && !segmentIds.includes(segment.id)) return;

      const before = segment.text || "";
      const after = typeof replace === "function"
        ? before.replace(pattern, replace)
        : before.replace(pattern, replace);

      if (before !== after) {
        changes.push({
          segmentId: segment.id,
          before,
          after,
        });
      }
    });

    return changes;
  }

  /**
   * Correct common transcription errors in batch
   * @param {Array} segments - Transcript segments
   * @param {Object} corrections - Map of incorrect -> correct text
   * @param {Array} segmentIds - IDs to limit corrections to
   * @returns {Array} Changes made
   */
  static correctCommon(segments, corrections, segmentIds = null) {
    const changes = [];

    segments.forEach((segment) => {
      if (segmentIds && !segmentIds.includes(segment.id)) return;

      let text = segment.text || "";
      let changed = false;

      Object.entries(corrections).forEach(([incorrect, correct]) => {
        const regex = new RegExp(`\\b${escapeRegex(incorrect)}\\b`, "gi");
        const newText = text.replace(regex, correct);
        if (newText !== text) {
          text = newText;
          changed = true;
        }
      });

      if (changed && text !== segment.text) {
        changes.push({
          segmentId: segment.id,
          before: segment.text,
          after: text,
        });
      }
    });

    return changes;
  }

  /**
   * Split a segment into multiple segments (for long utterances)
   * @param {Array} segments - Transcript segments
   * @param {string} segmentId - ID to split
   * @param {number} position - Character position to split at
   * @returns {Object} { newSegments, changes }
   */
  static splitSegment(segments, segmentId, position) {
    const segment = segments.find((s) => s.id === segmentId);
    if (!segment) return null;

    const text = segment.text || "";
    if (position <= 0 || position >= text.length) return null;

    const part1 = text.substring(0, position).trim();
    const part2 = text.substring(position).trim();

    return {
      newSegments: [
        {
          ...segment,
          text: part1,
        },
        {
          ...segment,
          id: `${segmentId}-split-${Date.now()}`,
          text: part2,
        },
      ],
      changes: [
        {
          segmentId,
          before: text,
          after: part1,
        },
      ],
    };
  }

  /**
   * Merge adjacent segments
   * @param {Array} segments - Transcript segments
   * @param {string} segmentId1 - First segment ID
   * @param {string} segmentId2 - Second segment ID
   * @returns {Object} { mergedSegment, changes }
   */
  static mergeSegments(segments, segmentId1, segmentId2) {
    const seg1 = segments.find((s) => s.id === segmentId1);
    const seg2 = segments.find((s) => s.id === segmentId2);

    if (!seg1 || !seg2) return null;

    // Only merge if same speaker
    if (seg1.speaker !== seg2.speaker) return null;

    const mergedText = `${seg1.text || ""} ${seg2.text || ""}`.trim();

    return {
      mergedSegment: {
        ...seg1,
        text: mergedText,
        end_seconds: seg2.end_seconds,
      },
      changes: [
        {
          segmentId: segmentId1,
          before: seg1.text,
          after: mergedText,
        },
        {
          segmentId: segmentId2,
          before: seg2.text,
          after: null, // Mark for deletion
        },
      ],
    };
  }
}

/**
 * Calculate similarity score between two strings (Levenshtein-like)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate edit distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function getEditDistance(a, b) {
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default {
  EditorHistory,
  TranscriptMatcher,
  BatchEditor,
};
