"use client";

import { useState, useRef, useCallback } from "react";

const MOCK_TRANSCRIPTIONS = {
  hinglish: [
    "Doctor: Aapko kab se yeh problem ho rahi hai?",
    "Patient: Sir, lagbhag do hafte se. Pehle thoda tha, ab bahut badh gaya hai.",
    "Doctor: Kya aapko fever bhi aa raha hai?",
    "Patient: Haan, raat ko halka fever aata hai, around 99-100 degree.",
    "Doctor: Okay. Aapki breathing mein koi problem?",
    "Patient: Haan doctor, thoda breathlessness feel hota hai, especially raat ko.",
    "Doctor: Aapko koi allergy hai kya kisi cheez se?",
    "Patient: Nahi sir, koi allergy nahi hai mujhe.",
    "Doctor: Theek hai, main aapko kuch tests likhta hoon. CBC, chest X-ray aur ek spirometry test.",
  ],
  hindi: [
    "चिकित्सक: आपको कब से यह समस्या हो रही है?",
    "रोगी: जी, लगभग दो हफ्ते से। पहले थोड़ा था, अब बहुत बढ़ गया है।",
    "चिकित्सक: क्या आपको बुखार भी आ रहा है?",
    "रोगी: हां, रात को हल्का बुखार आता है, लगभग 99-100 डिग्री।",
    "चिकित्सक: ठीक है। आपकी सांस लेने में कोई परेशानी?",
    "रोगी: हां डॉक्टर, थोड़ी सांस फूलती है, खासकर रात को।",
  ],
  english: [
    "Doctor: How long have you been experiencing this problem?",
    "Patient: Sir, for about two weeks. It was mild initially but has worsened significantly.",
    "Doctor: Are you also experiencing any fever?",
    "Patient: Yes, I get a mild fever at night, around 99-100 degrees.",
    "Doctor: Okay. Any difficulty in breathing?",
    "Patient: Yes doctor, I feel some breathlessness, especially at night.",
  ],
};

const MOCK_CLINICAL_NOTE = `## Clinical Note

**Date:** ${new Date().toLocaleDateString("en-IN")}
**Patient Complaint:** Respiratory symptoms with fever

### History of Present Illness
Patient presents with a 2-week history of progressive respiratory symptoms. Reports mild fever (99-100°F), predominantly nocturnal, with associated breathlessness that worsens at night. No known allergies.

### Review of Systems
- **Respiratory:** Breathlessness, worse at night
- **Constitutional:** Low-grade nocturnal fever
- **Allergies:** None reported

### Assessment
Suspected upper respiratory tract infection with possible bronchial involvement. Need to rule out:
1. Bronchitis
2. Mild pneumonia
3. Allergic bronchospasm

### Plan
1. **Investigations ordered:**
   - Complete Blood Count (CBC)
   - Chest X-ray (PA view)
   - Spirometry
2. **Medications:**
   - Tab. Azithromycin 500mg OD x 3 days
   - Tab. Montelukast 10mg HS
   - Salbutamol inhaler SOS
3. **Follow-up:** Review with reports in 3 days
`;

export function useScribe() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [language, setLanguage] = useState("hinglish");
  const [transcription, setTranscription] = useState([]);
  const [clinicalNote, setClinicalNote] = useState("");
  const [duration, setDuration] = useState(0);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const timerRef = useRef(null);
  const lineIndexRef = useRef(0);
  const transcriptionTimerRef = useRef(null);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setIsPaused(false);
    setTranscription([]);
    setClinicalNote("");
    setDuration(0);
    lineIndexRef.current = 0;

    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    const lines = MOCK_TRANSCRIPTIONS[language] || MOCK_TRANSCRIPTIONS.hinglish;
    transcriptionTimerRef.current = setInterval(() => {
      if (lineIndexRef.current < lines.length) {
        setTranscription((prev) => [...prev, lines[lineIndexRef.current]]);
        lineIndexRef.current++;
      }
    }, 3000);
  }, [language]);

  const pauseRecording = useCallback(() => {
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);
  }, []);

  const resumeRecording = useCallback(() => {
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    const lines = MOCK_TRANSCRIPTIONS[language] || MOCK_TRANSCRIPTIONS.hinglish;
    transcriptionTimerRef.current = setInterval(() => {
      if (lineIndexRef.current < lines.length) {
        setTranscription((prev) => [...prev, lines[lineIndexRef.current]]);
        lineIndexRef.current++;
      }
    }, 3000);
  }, [language]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);
  }, []);

  const generateClinicalNote = useCallback(() => {
    setIsGeneratingNote(true);
    setTimeout(() => {
      setClinicalNote(MOCK_CLINICAL_NOTE);
      setIsGeneratingNote(false);
    }, 2000);
  }, []);

  return {
    isRecording,
    isPaused,
    language,
    setLanguage,
    transcription,
    clinicalNote,
    duration,
    isGeneratingNote,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    generateClinicalNote,
  };
}
