"use client";

import { useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Languages } from "lucide-react";

export function TranscriptViewer({ transcription, language, isRecording, error }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcription]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Live Transcription</CardTitle>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Languages className="h-3 w-3" />
          {language.charAt(0).toUpperCase() + language.slice(1)}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea ref={scrollRef} className="h-[400px] px-6 pb-4">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="rounded-full bg-gray-100 p-3 mb-3">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                {error || "Transcript not available."}
              </p>
              {isRecording && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Recording is in progress. Transcript will appear after the production transcription pipeline completes.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {transcription.map((line, i) => {
                const isDoctor = line.toLowerCase().startsWith("doctor:");
                const isPatient = line.toLowerCase().startsWith("patient:");
                const speaker = isDoctor
                  ? "Doctor"
                  : isPatient
                  ? "Patient"
                  : null;
                const text = speaker
                  ? line.substring(line.indexOf(":") + 1).trim()
                  : line;

                return (
                  <div
                    key={i}
                    className={`flex gap-3 animate-in fade-in-50 slide-in-from-bottom-2 duration-300 ${
                      isDoctor ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                        isDoctor
                          ? "bg-primary/5 border border-primary/10"
                          : "bg-muted"
                      }`}
                    >
                      {speaker && (
                        <span
                          className={`text-[11px] font-semibold ${
                            isDoctor ? "text-primary" : "text-accent"
                          }`}
                        >
                          {speaker}
                        </span>
                      )}
                      <p className="text-sm text-foreground leading-relaxed">
                        {text}
                      </p>
                    </div>
                  </div>
                );
              })}

              {isRecording && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Listening...
                  </span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
