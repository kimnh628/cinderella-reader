"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { storyPages } from "@/data/story";
import StoryText from "@/components/StoryText";
import { useTTS } from "@/hooks/useTTS";

const VRMAvatar = dynamic(() => import("@/components/VRMAvatar"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-[#e8dcc8]/40">
      Loading avatar...
    </div>
  ),
});

export default function Home() {
  const [currentPage, setCurrentPage] = useState(0);
  const { speak, stop, isSpeaking, currentSentenceIndex } = useTTS();
  const page = storyPages[currentPage];

  const handlePlay = useCallback(() => {
    if (isSpeaking) {
      stop();
    } else {
      speak(page.text);
    }
  }, [isSpeaking, stop, speak, page.text]);

  const handlePrevPage = useCallback(() => {
    stop();
    setCurrentPage((p) => Math.max(0, p - 1));
  }, [stop]);

  const handleNextPage = useCallback(() => {
    stop();
    setCurrentPage((p) => Math.min(storyPages.length - 1, p + 1));
  }, [stop]);

  return (
    <main className="min-h-screen fantasy-bg flex flex-col overflow-hidden">
      {/* Header */}
      <header className="text-center pt-6 pb-4 relative z-10">
        <h1
          className="text-4xl md:text-5xl font-bold tracking-wide"
          style={{
            fontFamily: "'Cinzel', serif",
            background: "linear-gradient(180deg, #e8dcc8 0%, #b8a888 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.7))",
          }}
        >
          Cinderella
        </h1>
        <p
          className="text-sm mt-1 tracking-[0.3em] uppercase"
          style={{
            fontFamily: "'Cinzel', serif",
            color: "rgba(180, 160, 120, 0.5)",
          }}
        >
          A Fairy Tale
        </p>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 pb-4 flex flex-col lg:flex-row gap-5 items-stretch relative z-10 w-full">
        {/* Story Panel */}
        <div className="flex-1 order-2 lg:order-1 flex flex-col">
          <div className="ornate-frame p-7 md:p-9 flex-1 flex flex-col justify-between">
            {/* Chapter Title */}
            <div>
              <h2
                className="text-2xl md:text-3xl font-bold mb-5 pb-3"
                style={{
                  fontFamily: "'Cinzel', serif",
                  color: "#e8dcc8",
                  borderBottom: "1px solid rgba(180, 160, 120, 0.2)",
                }}
              >
                {page.title}
              </h2>

              {/* Story Text */}
              <StoryText
                text={page.text}
                currentSentenceIndex={currentSentenceIndex}
                isReading={isSpeaking}
              />
            </div>

            {/* Controls */}
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 0}
                className="fantasy-btn px-5 py-2.5 rounded-lg text-sm"
              >
                Prev
              </button>

              <div className="flex items-center gap-5">
                <button
                  onClick={handlePlay}
                  className={`fantasy-btn px-7 py-3 rounded-full text-sm font-semibold ${
                    isSpeaking ? "fantasy-btn-danger" : "fantasy-btn-primary"
                  }`}
                >
                  {isSpeaking ? "Stop" : "Read Aloud"}
                </button>

                <span
                  className="text-sm"
                  style={{
                    fontFamily: "'Cinzel', serif",
                    color: "rgba(180, 160, 120, 0.5)",
                  }}
                >
                  {currentPage + 1} / {storyPages.length}
                </span>
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === storyPages.length - 1}
                className="fantasy-btn px-5 py-2.5 rounded-lg text-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Avatar Panel */}
        <div className="w-full lg:w-[420px] xl:w-[480px] order-1 lg:order-2 flex-shrink-0 flex flex-col relative">
          <div
            className={`avatar-frame absolute inset-x-0 top-0 ${
              isSpeaking ? "speaking-glow" : ""
            }`}
            style={{ height: "140%", zIndex: 5 }}
          >
            <VRMAvatar isSpeaking={isSpeaking} />
          </div>
          <p
            className="text-center text-xs mt-2 relative"
            style={{
              fontFamily: "'Cinzel', serif",
              color: "rgba(180, 160, 120, 0.4)",
              zIndex: 10,
              marginTop: "auto",
            }}
          >
            {isSpeaking ? "Reading..." : "Click 'Read Aloud' to start"}
          </p>
        </div>
      </div>

      {/* Page dots */}
      <div className="flex justify-center gap-2.5 pb-5 relative z-10">
        {storyPages.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              stop();
              setCurrentPage(i);
            }}
            className={`w-2.5 h-2.5 rounded-full page-dot ${
              i === currentPage ? "active" : "bg-transparent"
            }`}
          />
        ))}
      </div>
    </main>
  );
}
