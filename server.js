import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// GEMINI
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const LIVE_MODEL = "gemini-3.1-flash-live-preview";
const CHAT_MODEL = "gemini-2.5-flash";

// IMPORTANT:
// Google Gemini SDK environment variable'dan
// GEMINI_API_KEY ni avtomatik oladi.
const ai = GEMINI_API_KEY
    ? new GoogleGenAI({})
    : null;

// =====================================================
// TEACHER HASAN INSTRUCTION
// =====================================================

const TEACHER_INSTRUCTION = `
Siz TEACHER HASANsiz.

Siz O'zbekistondagi o'quvchilarga ingliz tilini
o'rgatuvchi professional, samimiy va sabrli
AI English o'qituvchisiz.

QOIDALAR:

1. Asosan ravon o'zbek tilida gapiring.
2. Inglizcha misollarni aniq va sodda tushuntiring.
3. O'quvchi inglizcha gapirsa, xatolarini muloyim tuzating.
4. Grammatikani o'zbek tilida sodda tushuntiring.
5. O'quvchining A1-C1 darajasiga moslashing.
6. Speaking mashqlarida inglizcha savollar bering.
7. Grammar, Vocabulary, Fluency va Pronunciation bo'yicha
   qisqa maslahat bering.
8. Javoblarni juda uzun qilmang.
9. Tabiiy suhbat qiling.
10. O'quvchi "o'zbekcha tushuntiring" desa,
    o'zbek tilida tushuntiring.
11. Ovozli suhbatda tabiiy, samimiy va o'qituvchiga
    o'xshab gapiring.
12. O'zingizni Teacher Hasan deb tanishtiring.
13. O'quvchini doimo rag'batlantiring.
`;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: "10mb" }));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        name: "Teacher Hasan",
        gemini: Boolean(GEMINI_API_KEY),
        liveModel: LIVE_MODEL,
        chatModel: CHAT_MODEL
    });
});

// =====================================================
// GEMINI LIVE EPHEMERAL TOKEN
// =====================================================

app.get("/api/live-token", async (req, res) => {
    console.log("");
    console.log("==========================================");
    console.log("🎫 GEMINI LIVE TOKEN REQUEST");
    console.log("==========================================");

    try {
        if (!GEMINI_API_KEY) {
            console.error("❌ GEMINI_API_KEY mavjud emas.");

            return res.status(500).json({
                error: "GEMINI_API_KEY topilmadi."
            });
        }

        if (!ai) {
            console.error("❌ Gemini client yaratilmadi.");

            return res.status(500).json({
                error: "Gemini client mavjud emas."
            });
        }

        console.log("🔑 Gemini API key topildi.");
        console.log("🎤 Model:", LIVE_MODEL);
        console.log("⏳ Ephemeral token yaratilmoqda...");

        const expireTime = new Date(
            Date.now() + 30 * 60 * 1000
        ).toISOString();

        const newSessionExpireTime = new Date(
            Date.now() + 60 * 1000
        ).toISOString();

        const token = await ai.authTokens.create({
            config: {
                uses: 1,

                expireTime,

                newSessionExpireTime,

                liveConnectConstraints: {
                    model: LIVE_MODEL,

                    config: {
                        responseModalities: [
                            "AUDIO"
                        ],

                        inputAudioTranscription: {},

                        outputAudioTranscription: {},

                        systemInstruction:
                            TEACHER_INSTRUCTION,

                        sessionResumption: {}
                    }
                }
            }
        });

        console.log("==========================================");
        console.log("✅ EPHEMERAL TOKEN YARATILDI");
        console.log("🎤 LIVE READY");
        console.log("==========================================");
        console.log("");

        return res.json({
            success: true,
            token: token.name,
            model: LIVE_MODEL
        });

    } catch (error) {

        console.error("");
        console.error("==========================================");
        console.error("❌ GEMINI LIVE TOKEN XATOSI");
        console.error("==========================================");

        console.error(
            "Message:",
            error?.message
        );

        console.error(
            "Status:",
            error?.status
        );

        console.error(
            "Full error:",
            error
        );

        console.error(
            "=========================================="
        );
        console.error("");

        return res.status(500).json({
            success: false,
            error: "Gemini Live token yaratilmadi.",
            details: error?.message || "Unknown error"
        });
    }
});

// =====================================================
// NORMAL CHAT
// =====================================================

app.post("/api/chat", async (req, res) => {

    try {

        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: "GEMINI_API_KEY topilmadi."
            });
        }

        if (!ai) {
            return res.status(500).json({
                error: "Gemini client mavjud emas."
            });
        }

        const message = String(
            req.body?.message || ""
        ).trim();

        if (!message) {
            return res.status(400).json({
                error: "Xabar yuborilmadi."
            });
        }

        console.log(
            "💬 CHAT:",
            message
        );

        const result =
            await ai.models.generateContent({
                model: CHAT_MODEL,

                contents: message,

                config: {
                    systemInstruction:
                        TEACHER_INSTRUCTION
                }
            });

        return res.json({
            success: true,
            reply:
                result.text ||
                "Javob olinmadi."
        });

    } catch (error) {

        console.error(
            "❌ CHAT XATOSI:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Teacher Hasan bilan aloqa ishlamadi.",
            details:
                error?.message || "Unknown error"
        });
    }
});

// =====================================================
// 404
// =====================================================

app.use((req, res) => {

    res.status(404).json({
        error: "Endpoint topilmadi.",
        path: req.path
    });

});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

    console.log("");
    console.log(
        "=========================================="
    );

    console.log(
        "       👨‍🏫 TEACHER HASAN"
    );

    console.log(
        "=========================================="
    );

    console.log(
        `🌐 Port: ${PORT}`
    );

    console.log(
        `🎤 LIVE: ${LIVE_MODEL}`
    );

    console.log(
        `💬 CHAT: ${CHAT_MODEL}`
    );

    console.log(
        `🔑 Gemini API: ${
            GEMINI_API_KEY
                ? "ON"
                : "OFF"
        }`
    );

    console.log(
        "🇺🇿 Uzbek AI Teacher: ON"
    );

    console.log(
        "🔊 Native Audio: ON"
    );

    console.log(
        "📝 Transcription: ON"
    );

    console.log(
        "=========================================="
    );

    console.log("");
});