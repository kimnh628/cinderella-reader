import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";

const auth = new GoogleAuth({
  keyFilename: path.join(process.cwd(), "google-tts-service-account.json"),
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(
      "https://texttospeech.googleapis.com/v1beta1/text:synthesize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.token}`,
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: "en-US",
            name: "en-US-Chirp3-HD-Zephyr",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 0.9,
            pitch: 0,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Google TTS error:", error);
      return NextResponse.json(
        { error: "TTS request failed", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ audioContent: data.audioContent });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
