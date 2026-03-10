"use client";

interface StoryTextProps {
  text: string;
  currentSentenceIndex: number;
  isReading: boolean;
}

export default function StoryText({
  text,
  currentSentenceIndex,
  isReading,
}: StoryTextProps) {
  // Split text into sentences (keep delimiters attached)
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];

  return (
    <p
      className="text-xl md:text-2xl leading-relaxed select-none"
      style={{ fontFamily: "'Crimson Text', Georgia, serif" }}
    >
      {sentences.map((sentence, i) => {
        const isCurrent = isReading && i === currentSentenceIndex;
        const isPast = isReading && i < currentSentenceIndex;

        return (
          <span
            key={i}
            className="transition-all duration-300"
            style={{
              color: isCurrent
                ? "#fff"
                : isPast
                  ? "rgba(180, 160, 120, 0.45)"
                  : "#e8dcc8",
              fontWeight: isCurrent ? 700 : undefined,
            }}
          >
            {sentence}
          </span>
        );
      })}
    </p>
  );
}
