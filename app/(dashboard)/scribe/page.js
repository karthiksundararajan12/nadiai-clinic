"use client";

import { Header } from "@/components/layout/header";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { ScribeRecorder } from "@/components/scribe/scribe-recorder";
import { TranscriptViewer } from "@/components/scribe/transcript-viewer";
import { ScribeNotes } from "@/components/scribe/scribe-notes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScribe } from "@/hooks/use-scribe";
import { FileText, RotateCcw } from "lucide-react";

export default function ScribePage() {
  const {
    isRecording,
    isPaused,
    language,
    setLanguage,
    transcription,
    clinicalNote,
    transcriptionError,
    duration,
    isGeneratingNote,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useScribe();

  return (
    <>
      <Header
        title="AI Scribe"
        subtitle="Record consultations and review production transcript/SOAP outputs"
      />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <LanguageToggle value={language} onChange={setLanguage} />
          <div className="flex items-center gap-2">
            {transcription.length > 0 && !isRecording && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Session
              </Button>
            )}
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center p-8">
            <ScribeRecorder
              isRecording={isRecording}
              isPaused={isPaused}
              duration={duration}
              onStart={startRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onStop={stopRecording}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <TranscriptViewer
            transcription={transcription}
            language={language}
            isRecording={isRecording}
            error={transcriptionError}
          />
          <ScribeNotes
            clinicalNote={clinicalNote}
            isGeneratingNote={isGeneratingNote}
          />
        </div>

        {!isRecording && transcription.length === 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <span className="text-lg">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Select Language</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose Hinglish, Hindi, or English for transcription
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <span className="text-lg">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Record Consultation</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap the mic button and speak naturally with your patient
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-accent/10 p-2">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">SOAP Review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    SOAP note has not been generated.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
