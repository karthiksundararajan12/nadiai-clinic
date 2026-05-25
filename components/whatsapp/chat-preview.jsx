"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Check, CheckCheck } from "lucide-react";

const MOCK_CHAT = [
  {
    from: "patient",
    message: "Hi, I want to book an appointment",
    time: "10:30 AM",
  },
  {
    from: "bot",
    message:
      "Namaste! Welcome to Dr. Ananya Mehta's clinic. Main aapki appointment book karne mein madad kar sakti hoon. Kya aap naye patient hain ya pehle se registered hain?",
    time: "10:30 AM",
  },
  {
    from: "patient",
    message: "Naya patient hoon",
    time: "10:31 AM",
  },
  {
    from: "bot",
    message:
      "Welcome! Sabse pehle mujhe aapka naam bataiye? Aur aapki kya problem hai briefly?",
    time: "10:31 AM",
  },
  {
    from: "patient",
    message: "Mera naam Rohit hai. Mujhe chest pain ho raha hai",
    time: "10:32 AM",
  },
  {
    from: "bot",
    message:
      "Thank you Rohit ji. Chest pain ke liye Dr. Mehta available hain. Yeh dates available hain:\n\n1. 26 May (Mon) - 10:00 AM\n2. 26 May (Mon) - 2:00 PM\n3. 27 May (Tue) - 9:00 AM\n\nKaunsa time suit karega? Number reply karein.",
    time: "10:32 AM",
  },
  {
    from: "patient",
    message: "1",
    time: "10:33 AM",
  },
  {
    from: "bot",
    message:
      "Aapka appointment confirm ho gaya hai!\n\nPatient: Rohit\nDoctor: Dr. Ananya Mehta\nDate: 26 May 2026 (Monday)\nTime: 10:00 AM\nAppointment ID: APT-2026052601\n\nPlease 15 min pehle aayein. Dhanyavaad!",
    time: "10:33 AM",
  },
];

export function ChatPreview() {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <CardTitle className="text-base">Live Chat Preview</CardTitle>
        </div>
        <Badge variant="success" className="text-[10px]">
          Bot Active
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[500px]">
          <div className="space-y-3 p-4" style={{ background: "linear-gradient(to bottom, hsl(var(--muted) / 0.3), hsl(var(--background)))" }}>
            {MOCK_CHAT.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.from === "bot" ? "justify-start" : "justify-end"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                    msg.from === "bot"
                      ? "bg-card border border-border rounded-tl-sm"
                      : "bg-green-600 text-white rounded-tr-sm"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.from === "bot" ? (
                      <Bot className="h-3 w-3 text-primary" />
                    ) : (
                      <User className="h-3 w-3 opacity-70" />
                    )}
                    <span
                      className={`text-[10px] font-medium ${
                        msg.from === "bot"
                          ? "text-primary"
                          : "text-green-100"
                      }`}
                    >
                      {msg.from === "bot" ? "Nadi Bot" : "Patient"}
                    </span>
                  </div>
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-line ${
                      msg.from === "bot" ? "text-foreground" : "text-white"
                    }`}
                  >
                    {msg.message}
                  </p>
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 ${
                      msg.from === "bot"
                        ? "text-muted-foreground"
                        : "text-green-200"
                    }`}
                  >
                    <span className="text-[10px]">{msg.time}</span>
                    {msg.from === "bot" && (
                      <CheckCheck className="h-3 w-3 text-blue-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
