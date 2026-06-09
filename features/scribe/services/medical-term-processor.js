/**
 * @fileoverview Medical term post-processor for improving transcription accuracy
 * Handles common medical terminology that speech-to-text engines often misrecognize
 * in Indian English and Hinglish contexts.
 */

/**
 * Common medical terms and their phonetically similar misspellings
 * Format: { incorrect: correct, ...}
 */
const MEDICAL_TERM_MAP = {
  // Common Indian medical terminology
  "BP": "blood pressure",
  "HR": "heart rate",
  "RR": "respiratory rate",
  "O2 sat": "oxygen saturation",
  "SpO2": "oxygen saturation",
  "temp": "temperature",
  "wbc": "white blood cell count",
  "rbc": "red blood cell count",
  "hb": "hemoglobin",
  "plt": "platelet",
  "ast": "aspartate aminotransferase",
  "alt": "alanine aminotransferase",
  "creatinine": "creatinine",
  "bun": "blood urea nitrogen",
  "fbs": "fasting blood sugar",
  "ppbs": "postprandial blood sugar",
  "hba1c": "HbA1C",
  "tsh": "thyroid stimulating hormone",
  "t3": "T3",
  "t4": "T4",
  "urine rout": "urine routine",
  "chest ex": "chest X-ray",
  "xray": "X-ray",
  "ekg": "electrocardiogram",
  "ecg": "electrocardiogram",
  "echo": "echocardiogram",
  "ultrasound": "ultrasound",
  "ct scan": "CT scan",
  "mri": "MRI",
  "pus": "pus cells",
  "rbc urine": "RBC in urine",
  "wbc urine": "WBC in urine",
  "uti": "urinary tract infection",
  "urti": "upper respiratory tract infection",
  "lrti": "lower respiratory tract infection",
  "dyspnea": "dyspnea",
  "dysuria": "dysuria",
  "abd": "abdominal",
  "cvs": "cardiovascular system",
  "cns": "central nervous system",
  "pns": "peripheral nervous system",
  "resp": "respiratory",
  "gi": "gastrointestinal",
  "ns": "nervous system",

  // Common phonetic mistakes
  "diabeetus": "diabetes",
  "diabitiс": "diabetes",
  "high pressure": "hypertension",
  "low pressure": "hypotension",
  "sugar": "diabetes", // context-dependent
  "pressure": "hypertension", // context-dependent
  "asthama": "asthma",
  "azma": "asthma",
  "heart attack": "myocardial infarction",
  "stroke": "cerebrovascular accident",
  "tb": "tuberculosis",
  "pneumonia": "pneumonia",
  "bronchitis": "bronchitis",
  "sinusitis": "sinusitis",
  "allergies": "allergies",
  "allergy": "allergy",
  "migraine": "migraine",
  "headache": "headache",
  "fever": "fever",
  "cough": "cough",
  "cold": "common cold",
  "loose motion": "diarrhea",
  "loose stool": "diarrhea",
  "constipation": "constipation",
  "acidity": "acid reflux",
  "heartburn": "heartburn",
  "nausea": "nausea",
  "vomiting": "vomiting",
  "abdominal pain": "abdominal pain",
  "stomach pain": "abdominal pain",
  "body ache": "myalgia",
  "joint pain": "arthralgia",
  "back pain": "back pain",
  "chest pain": "chest pain",
  "throat pain": "sore throat",
  "skin rash": "rash",
  "itching": "pruritus",
  "swelling": "edema",
  "weakness": "weakness",
  "fatigue": "fatigue",
  "giddiness": "dizziness",
  "vertigo": "vertigo",
  "anxiety": "anxiety",
  "depression": "depression",
  "sleep issue": "insomnia",
  "sleeplessness": "insomnia",
};

/**
 * Medication name corrections for common misrecognitions
 */
const MEDICATION_MAP = {
  "paracetamol": "paracetamol",
  "acetaminophen": "paracetamol",
  "ibuprofen": "ibuprofen",
  "aspirin": "aspirin",
  "amoxicillin": "amoxicillin",
  "ampicillin": "ampicillin",
  "ciprofloxacin": "ciprofloxacin",
  "levofloxacin": "levofloxacin",
  "azithromycin": "azithromycin",
  "metformin": "metformin",
  "glipizide": "glipizide",
  "atorvastatin": "atorvastatin",
  "amlodipine": "amlodipine",
  "lisinopril": "lisinopril",
  "losartan": "losartan",
  "atenolol": "atenolol",
  "metoprolol": "metoprolol",
  "omeprazole": "omeprazole",
  "ranitidine": "ranitidine",
  "pantoprazole": "pantoprazole",
  "cetirizine": "cetirizine",
  "loratadine": "loratadine",
  "salbutamol": "salbutamol",
  "budesonide": "budesonide",
  "fluticasone": "fluticasone",
  "albuterol": "albuterol",
};

/**
 * Process transcript segments to correct common medical term misrecognitions
 * @param {Array} segments - Array of transcript segments with { text, ... }
 * @returns {Array} - Segments with corrected medical terms
 */
export function processMedicalTerms(segments) {
  if (!Array.isArray(segments)) return segments;

  return segments.map((segment) => ({
    ...segment,
    text: correctMedicalTerms(segment.text),
  }));
}

/**
 * Correct medical terms in text
 * @param {string} text - Raw transcribed text
 * @returns {string} - Text with corrected medical terms
 */
export function correctMedicalTerms(text) {
  if (!text || typeof text !== "string") return text;

  let corrected = text;

  // Apply medical term corrections (case-insensitive)
  const lowerText = text.toLowerCase();
  const entries = Object.entries(MEDICAL_TERM_MAP);

  for (const [incorrect, correct] of entries) {
    const regex = new RegExp(`\\b${escapeRegex(incorrect)}\\b`, "gi");
    corrected = corrected.replace(regex, correct);
  }

  // Apply medication corrections
  for (const [incorrect, correct] of Object.entries(MEDICATION_MAP)) {
    const regex = new RegExp(`\\b${escapeRegex(incorrect)}\\b`, "gi");
    corrected = corrected.replace(regex, correct);
  }

  // Clean up common spacing issues
  corrected = corrected
    .replace(/\s+/g, " ") // Multiple spaces to single space
    .replace(/\s+([.,;:])/g, "$1") // Remove space before punctuation
    .trim();

  return corrected;
}

/**
 * Extract and normalize clinical values (BP readings, temperatures, etc.)
 * @param {string} text - Raw transcribed text
 * @returns {Object} - Extracted clinical values
 */
export function extractClinicalValues(text) {
  if (!text || typeof text !== "string") return {};

  const values = {};

  // Blood pressure pattern: 120/80 or 120 by 80
  const bpMatch = text.match(/(\d{2,3})\s*(?:\/|by|over)\s*(\d{2,3})/);
  if (bpMatch) {
    values.bloodPressure = `${bpMatch[1]}/${bpMatch[2]}`;
  }

  // Heart rate/Pulse: "70 beats" or "70 bpm"
  const hrMatch = text.match(/(\d{2,3})\s*(?:beats|bpm|per minute)/i);
  if (hrMatch) {
    values.heartRate = `${hrMatch[1]} bpm`;
  }

  // Temperature: "98.6 F" or "37 C"
  const tempMatch = text.match(/(\d{2}\.?\d*)\s*(?:°)?([FC])/i);
  if (tempMatch) {
    values.temperature = `${tempMatch[1]}°${tempMatch[2].toUpperCase()}`;
  }

  // Oxygen saturation: "98%" or "98 percent"
  const o2Match = text.match(/(\d{2,3})\s*(?:%|percent)(?:\s+(?:O2|SpO2|oxygen))?/i);
  if (o2Match) {
    values.oxygenSaturation = `${o2Match[1]}%`;
  }

  // Weight: "70 kg" or "70kg"
  const weightMatch = text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:kg|kilograms|pounds|lbs)/i);
  if (weightMatch) {
    values.weight = `${weightMatch[1]} kg`;
  }

  return values;
}

/**
 * Validate transcript quality based on medical content
 * @param {string} text - Transcript text
 * @returns {Object} - Quality metrics
 */
export function assessTranscriptQuality(text) {
  if (!text || typeof text !== "string") {
    return { score: 0, issues: ["No transcript text"] };
  }

  const issues = [];
  let score = 100;

  // Check for suspicious patterns that indicate poor transcription
  const suspiciousPatterns = [
    { pattern: /\b([a-z])\1{3,}\b/gi, message: "Repeated characters suggest poor audio" },
    { pattern: /(\s{2,})/g, message: "Excessive spacing" },
    { pattern: /[^a-zA-Z0-9\s\.\,\-]/g, message: "Strange characters detected" },
  ];

  for (const { pattern, message } of suspiciousPatterns) {
    if (pattern.test(text)) {
      issues.push(message);
      score -= 10;
    }
  }

  // Check for presence of medical content
  const medicalTermCount = Object.keys(MEDICAL_TERM_MAP).filter(
    (term) => new RegExp(`\\b${term}\\b`, "i").test(text),
  ).length;

  if (medicalTermCount < 3) {
    issues.push("Few medical terms detected - may indicate unclear audio");
    score -= 5;
  }

  // Check text length
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 10) {
    issues.push("Very short transcript - insufficient content");
    score -= 15;
  }

  return {
    score: Math.max(0, score),
    issues: issues.length > 0 ? issues : ["No issues detected"],
    wordCount,
    medicalTermCount,
  };
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default {
  processMedicalTerms,
  correctMedicalTerms,
  extractClinicalValues,
  assessTranscriptQuality,
};
