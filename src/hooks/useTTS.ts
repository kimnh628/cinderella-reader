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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fakeVolumeRef = useRef(0);
  const fakeVolumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stopFakeVolume = useCallback(() => {
    if (fakeVolumeTimerRef.current) {
      clearInterval(fakeVolumeTimerRef.current);
      fakeVolumeTimerRef.current = null;
    }
    fakeVolumeRef.current = 0;
  }, []);

  const cleanupAudioGraph = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* already disconnected */ }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* already disconnected */ }
      analyserRef.current = null;
    }
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
    cleanupAudioGraph();
    stopFakeVolume();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setCurrentSentenceIndex(-1);
  }, [clearTimers, cleanupAudioGraph, stopFakeVolume]);

  /** Get audio analysis: volume + frequency bands for viseme mapping */
  const getVolume = useCallback((): { volume: number; low: number; mid: number; high: number } => {
    const analyser = analyserRef.current;
    if (analyser) {
      // Time-domain for volume
      const timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeData.length);
      const volume = Math.min(1, rms / 0.25);

      // Frequency-domain for vowel shapes
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);
      const binCount = freqData.length;
      // Split into 3 bands: low (vowels), mid (consonants), high (sibilants)
      const third = Math.floor(binCount / 3);
      let lowSum = 0, midSum = 0, highSum = 0;
      for (let i = 0; i < third; i++) lowSum += freqData[i];
      for (let i = third; i < third * 2; i++) midSum += freqData[i];
      for (let i = third * 2; i < binCount; i++) highSum += freqData[i];
      const low = Math.min(1, (lowSum / third) / 180);
      const mid = Math.min(1, (midSum / third) / 180);
      const high = Math.min(1, (highSum / (binCount - third * 2)) / 180);

      return { volume, low, mid, high };
    }
    return { volume: fakeVolumeRef.current, low: fakeVolumeRef.current * 0.7, mid: fakeVolumeRef.current * 0.3, high: 0 };
  }, []);

  const startFakeVolume = useCallback(() => {
    stopFakeVolume();
    fakeVolumeTimerRef.current = setInterval(() => {
      const t = performance.now() / 1000;
      const base = 0.35 + Math.sin(t * 2.5) * 0.15;
      const jitter = (Math.random() - 0.5) * 0.2;
      const pause = Math.sin(t * 1.2) > 0.8 ? 0 : 1;
      fakeVolumeRef.current = Math.max(0, Math.min(1, (base + jitter) * pause));
    }, 50);
  }, [stopFakeVolume]);

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

          // Setup Web Audio API analyser for real volume detection
          if (!audioContextRef.current || audioContextRef.current.state === "closed") {
            audioContextRef.current = new AudioContext();
          }
          const ctx = audioContextRef.current;
          if (ctx.state === "suspended") await ctx.resume();

          cleanupAudioGraph();

          const source = ctx.createMediaElementSource(audio);
          sourceRef.current = source;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          analyserRef.current = analyser;

          audio.addEventListener("loadedmetadata", () => {
            const duration = audio.duration;
            const totalChars = sentences.reduce(
              (sum, s) => sum + (s.end - s.start),
              0
            );

            setIsSpeaking(true);
            setCurrentSentenceIndex(0);

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
            cleanupAudioGraph();
            URL.revokeObjectURL(audioUrl);
          });

          try {
            await audio.play();
          } catch (playErr) {
            console.warn("[TTS] audio.play() failed:", playErr);
            cleanupAudioGraph();
            URL.revokeObjectURL(audioUrl);
            throw playErr; // fall through to Web Speech API
          }
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

      setIsSpeaking(true);
      setCurrentSentenceIndex(0);
      startFakeVolume();

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
        stopFakeVolume();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setCurrentSentenceIndex(-1);
        stopFakeVolume();
      };

      window.speechSynthesis.speak(utterance);
    },
    [stop, clearTimers, cleanupAudioGraph, startFakeVolume, stopFakeVolume]
  );

  return { speak, stop, isSpeaking, currentSentenceIndex, getVolume };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}
