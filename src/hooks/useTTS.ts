"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/** Split text into sentences, returning their char offsets */
function splitSentences(text: string): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];
  const regex = /[^.!?]+[.!?]+\s*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    result.push({ start: match.index, end: match.index + match[0].length });
  }
  if (result.length === 0) {
    result.push({ start: 0, end: text.length });
  }
  return result;
}

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesLoadedRef = useRef(false);

  // Preload voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      window.speechSynthesis.getVoices();
      voicesLoadedRef.current = true;
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    clearTimers();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setCurrentSentenceIndex(-1);
  }, [clearTimers]);

  const speak = useCallback(
    async (text: string) => {
      stop();

      const sentences = splitSentences(text);

      // Try Google Cloud TTS first
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (res.ok) {
          const { audioContent } = await res.json();
          const audioBlob = base64ToBlob(audioContent, "audio/mp3");
          const audioUrl = URL.createObjectURL(audioBlob);

          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.addEventListener("loadedmetadata", () => {
            const duration = audio.duration;
            const totalChars = sentences.reduce(
              (sum, s) => sum + (s.end - s.start),
              0
            );

            setIsSpeaking(true);
            setCurrentSentenceIndex(0);

            // Schedule each sentence transition proportional to char length
            let elapsed = 0;
            for (let i = 1; i < sentences.length; i++) {
              const prevLen = sentences[i - 1].end - sentences[i - 1].start;
              elapsed += (prevLen / totalChars) * duration * 1000;
              const idx = i;
              const delay = elapsed;
              timersRef.current.push(
                setTimeout(() => setCurrentSentenceIndex(idx), delay)
              );
            }
          });

          audio.addEventListener("ended", () => {
            setIsSpeaking(false);
            setCurrentSentenceIndex(-1);
            clearTimers();
            URL.revokeObjectURL(audioUrl);
          });

          audio.play();
          return;
        }
      } catch {
        // Fall through to Web Speech API
      }

      // Web Speech API fallback
      if (!("speechSynthesis" in window)) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utteranceRef.current = utterance;

      // Find the best female English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredNames = [
        "Zephyr",
        "Google UK English Female",
        "Google US English",
        "Samantha",
        "Karen",
        "Moira",
        "Tessa",
      ];

      let selectedVoice = null;
      for (const name of preferredNames) {
        selectedVoice = voices.find(
          (v) => v.name.includes(name) && v.lang.startsWith("en")
        );
        if (selectedVoice) break;
      }
      if (!selectedVoice) {
        selectedVoice = voices.find((v) => v.lang.startsWith("en"));
      }
      if (selectedVoice) utterance.voice = selectedVoice;

      // Track sentence by boundary charIndex
      setIsSpeaking(true);
      setCurrentSentenceIndex(0);

      utterance.onboundary = (event) => {
        if (event.name === "word") {
          for (let i = 0; i < sentences.length; i++) {
            if (event.charIndex < sentences[i].end) {
              setCurrentSentenceIndex(i);
              break;
            }
          }
        }
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setCurrentSentenceIndex(-1);
        clearTimers();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setCurrentSentenceIndex(-1);
      };

      window.speechSynthesis.speak(utterance);
    },
    [stop, clearTimers]
  );

  return { speak, stop, isSpeaking, currentSentenceIndex };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}
