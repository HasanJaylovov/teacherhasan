import express from "express";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import pg from "pg";
import multer from "multer";
import nodemailer from "nodemailer";
import { generateOtp, hashOtp, safeEqualHex, hashSessionToken, verifyAdminPassword, readCookie, buildAdminSessionCookie, clearAdminSessionCookie } from "./lib/admin-auth.js";

const { Pool } = pg;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

const PORT = process.env.PORT || 3000;

// ==============================================
// POSTGRESQL CONNECTION
// ==============================================

const pool = process.env.DATABASE_URL
    ? new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: {
              rejectUnauthorized: false
          }
      })
    : null;

if (pool) {
    pool.query("SELECT NOW()")
        .then(() => {
            console.log("✅ PostgreSQL connection OK");
        })
        .catch((error) => {
            console.error(
                "❌ PostgreSQL connection error:",
                error.message
            );
        });
}


// ==============================================// CONFIG
// ==============================================
const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || "";

const LIVE_MODEL =
    "gemini-3.1-flash-live-preview";

const CHAT_MODEL = process.env.CHAT_MODEL || "gemini-3.8-flash";

const GUEST_MINUTES =
    Number(process.env.GUEST_MINUTES || 10);

const TRIAL_DAYS =
    Number(process.env.TRIAL_DAYS || 1);

// ==============================================
// PASSWORD RESET EMAIL
// ==============================================

const SMTP_HOST =
    process.env.SMTP_HOST || "";

const SMTP_PORT =
    Number(process.env.SMTP_PORT || 587);

const SMTP_USER =
    process.env.SMTP_USER || "";

const SMTP_PASSWORD =
    process.env.SMTP_PASSWORD || "";

const SMTP_FROM =
    process.env.SMTP_FROM ||
    SMTP_USER ||
    "no-reply@teacherhasan.uz";

const PASSWORD_RESET_URL =
    process.env.PASSWORD_RESET_URL ||
    "https://teacherhasan.uz/reset-password.html";

const mailTransporter =
    SMTP_HOST && SMTP_USER && SMTP_PASSWORD
        ? nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure:
                String(process.env.SMTP_SECURE || "false")
                    .toLowerCase() === "true",
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD
            }
        })
        : null;

function hashResetToken(token) {
    return crypto
        .createHash("sha256")
        .update(String(token))
        .digest("hex");
}

async function sendPasswordResetEmail({
    email,
    fullName,
    token
}) {
    if (!mailTransporter) {
        throw new Error(
            "SMTP sozlamalari mavjud emas."
        );
    }

    const resetUrl =
        `${PASSWORD_RESET_URL}?token=${encodeURIComponent(token)}`;

    const safeName =
        String(fullName || "Teacher Hasan o‘quvchisi");

    await mailTransporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: "Teacher Hasan — parolni almashtirish",
        text:
            `Assalomu alaykum, ${safeName}!\n\n` +
            `Parolingizni almashtirish uchun quyidagi havolani oching:\n\n` +
            `${resetUrl}\n\n` +
            `Havola 15 daqiqa amal qiladi.\n\n` +
            `Agar bu so‘rovni siz yubormagan bo‘lsangiz, ushbu xabarni e’tiborsiz qoldiring.`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px">
                <h2>Teacher Hasan</h2>

                <p>Assalomu alaykum, ${safeName}!</p>

                <p>
                    Parolingizni almashtirish uchun quyidagi tugmani bosing:
                </p>

                <p>
                    <a
                        href="${resetUrl}"
                        style="
                            display:inline-block;
                            padding:14px 24px;
                            background:#2563eb;
                            color:white;
                            text-decoration:none;
                            border-radius:10px;
                            font-weight:bold;
                        "
                    >
                        🔐 PAROLNI ALMASHTIRISH
                    </a>
                </p>

                <p>
                    Ushbu havola <b>15 daqiqa</b> amal qiladi.
                </p>

                <p style="color:#777">
                    Agar bu so‘rovni siz yubormagan bo‘lsangiz,
                    ushbu xabarni e’tiborsiz qoldiring.
                </p>
            </div>
        `
    });
}


const PLAN_1_MONTH =
    Number(process.env.PLAN_1_MONTH || 35000);

const PLAN_2_MONTHS =
    Number(process.env.PLAN_2_MONTHS || 55000);

const PLAN_3_MONTHS =
    Number(process.env.PLAN_3_MONTHS || 99000);
const MULTICARD_APPLICATION_ID =
    process.env.MULTICARD_APPLICATION_ID || "";

const MULTICARD_APPLICATION_SECRET =
    process.env.MULTICARD_APPLICATION_SECRET || "";

const MULTICARD_STORE_ID =
    Number(process.env.MULTICARD_STORE_ID || 0);

const MULTICARD_SECRET =
    process.env.MULTICARD_SECRET || "";

const MULTICARD_API_URL =
    process.env.MULTICARD_API_URL ||
    "https://dev-mesh.multicard.uz";

const MULTICARD_CALLBACK_URL =
    process.env.MULTICARD_CALLBACK_URL ||
    "https://teacherhasan.uz/api/payment/webhook";

const MULTICARD_RETURN_URL =
    process.env.MULTICARD_RETURN_URL ||
    "https://teacherhasan.uz/";


const PRIVACY_POLICY_VERSION = "1.0";
const OFFER_VERSION = "1.0";


// ==============================================// GEMINI CLIENT
// ==============================================
const ai = GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
        httpOptions: {
            apiVersion: "v1alpha"
        }
    })
    : null;


// ==============================================// TEACHER HASAN INSTRUCTION
// ==============================================

async function generateGeminiWithRetry(options, maxAttempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await ai.models.generateContent(options);
        } catch (error) {
            lastError = error;

            const message = String(error?.message || error || "").toLowerCase();
            const isQuotaExceeded =
                message.includes("quota exceeded") ||
                message.includes("generate_content_free_tier_requests") ||
                message.includes("resource_exhausted");

            const isRetryable =
                !isQuotaExceeded &&
                (
                    message.includes("503") ||
                    message.includes("unavailable") ||
                    message.includes("high demand")
                );

            if (!isRetryable || attempt === maxAttempts) {
                throw error;
            }

            const delay = attempt * 1500;

            console.warn(
                `⚠️ Gemini vaqtinchalik xato. ${delay}ms dan keyin qayta uriniladi (${attempt}/${maxAttempts})`
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

const TEACHER_INSTRUCTION = `
Siz TEACHER HASAN AI — professional, sabrli va interaktiv ko'p tilli AI o'qituvchisiz.

Siz 8 ta tilni o'rgatasiz: Uzbek, English, German, Arabic, Russian, Turkish, Korean va Chinese (Mandarin).

SUHBATNI BOSHLASH VA TIL TANLASH:

- Har doim learnerContext ichidagi foydalanuvchi xotirasini tekshiring.
- Agar preferred_language yoki avvalgi dars mavzusi mavjud bo'lsa, bu mavjud foydalanuvchi. Aynan o'sha o'rganilayotgan tilni davom ettiring.
- Mavjud foydalanuvchidan qaysi tilni o'rganishini qayta so'ramang va boshqa tillar ro'yxatini taklif qilmang.
- Mavjud foydalanuvchi "davom etamiz" desa, saqlangan til, mavzu va oxirgi dars xulosasidagi keyingi qadamdan darhol davom eting.
- Mavjud foydalanuvchi boshqa tilni aniq so'ramaguncha preferred_language ni o'zgartirmang; o'zingiz boshqa tilga o'tishni taklif qilmang.
- Faqat yangi foydalanuvchida o'quv tili ham, oldingi dars xotirasi ham bo'lmasa, barcha 8 tilni sanang: Uzbek, English, German, Arabic, Russian, Turkish, Korean va Chinese. So'ng qaysi birini o'rganmoqchi ekanini bir marta so'rang.
- Foydalanuvchi birinchi xabaridayoq tilni tanlasa, shu tilni tanlangan deb belgilang va darsni boshlang; ro'yxatni qayta aytmang.
- Muloqot tilini (o'zbek/rus) o'rganilayotgan tildan alohida tuting.
- Har bir tanlangan tilda talaffuz, yozuv, so'z boyligi, grammatika, tinglab tushunish, o'qish, yozish va kundalik suhbatni o'rgating.
- Arabic uchun arab yozuvi va talaffuzini; Korean uchun Hangulni; Chinese uchun Mandarin, Pinyin va tonlarni tushuntiring.
- Uzbek, English, German, Arabic, Russian, Turkish, Korean va Chinese tillarida foydalanuvchining darajasiga mos mashqlar tuzing.

YARATUVCHI HAQIDAGI SAVOLLAR:
- "Seni kim yaratgan?", "Kim ishlab chiqqan?", "Muallifing kim?", "Kimning loyihasisan?" va yaratuvchi/dasturchi haqida so'ralgan o'xshash savollarga qisqa va aniq: "Meni Hasan Jaylovov yaratgan" deb javob bering.
- Bu savollarga boshqa shaxs yoki kompaniya nomini yaratuvchi sifatida aytmang.

QOIDALAR:

1. Asosan ravon o'zbek tilida gapiring.
2. Tanlangan tilni o'rgatishda shu tildagi misollarni aniq va sodda tushuntiring.
3. O'quvchi o'rganayotgan tilida gapirsa, xatolarini muloyim tuzating.
4. Grammatikani o'zbek yoki foydalanuvchi tanlagan rus tilida sodda tushuntiring.
5. O'quvchining A1-C1 darajasiga moslashing.
6. Speaking mashqlarida tanlangan o'rganish tilida savollar bering.
7. Grammar, Vocabulary, Fluency va Pronunciation bo'yicha qisqa maslahat bering.
8. Javoblarni juda uzun qilmang.
9. Tabiiy suhbat qiling.
10. O'quvchi "o'zbekcha tushuntiring" desa, o'zbek tilida tushuntiring.
11. Ovozli suhbatda tabiiy, samimiy va o'qituvchiga o'xshab gapiring.
12. O'zingizni Teacher Hasan AI deb tanishtiring.
13. O'quvchini doimo rag'batlantiring.
`;


// ==============================================// MIDDLEWARE
// ==============================================
app.use(express.json({
    limit: "10mb"
}));

app.use(express.urlencoded({
    extended: true
}));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ==============================================// DATABASE - JSON
// ==============================================



// ==============================================// PASSWORD HASH
// ==============================================
function hashPassword(password) {

    return crypto
        .createHash("sha256")
        .update(
            String(password)
        )
        .digest("hex");
}


// ==============================================// USER SESSIONS
// ==============================================
const userSessions =
    new Map();


// ==============================================// HELPERS
// ==============================================
function generateToken() {

    return crypto
        .randomBytes(48)
        .toString("hex");
}

function normalizeEmail(email) {

    return String(
        email || ""
    )
        .trim()
        .toLowerCase();
}

function normalizePhone(phone) {

    return String(
        phone || ""
    )
        .replace(/\s+/g, "")
        .trim();
}


function parseCookies(req) {
    const header = req.headers.cookie || "";

    return Object.fromEntries(
        header
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const index = part.indexOf("=");

                if (index === -1) {
                    return [part, ""];
                }

                return [
                    part.slice(0, index),
                    decodeURIComponent(part.slice(index + 1))
                ];
            })
    );
}

function setGuestDeviceCookie(res, deviceId) {
    const secure =
        process.env.NODE_ENV === "production"
            ? "; Secure"
            : "";

    res.setHeader(
        "Set-Cookie",
        `th_device_id=${encodeURIComponent(deviceId)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`
    );
}

function getGuestDeviceId(req, res) {
    const cookies = parseCookies(req);
    const existing = cookies.th_device_id;


    if (
        existing &&
        /^[0-9a-fA-F-]{36}$/.test(existing)
    ) {
        return existing;
    }

    const deviceId = crypto.randomUUID();

    setGuestDeviceCookie(
        res,
        deviceId
    );

    return deviceId;
}

function guestLimitSeconds() {
    return Math.max(
        0,
        GUEST_MINUTES * 60
    );
}

async function getGuestUsage(
    req,
    res,
    client = pool
) {
    if (!client) {
        throw new Error(
            "PostgreSQL mavjud emas."
        );
    }

    const deviceId =
        getGuestDeviceId(
            req,
            res
        );

    const result =
        await client.query(
            `
            SELECT
                device_id,
                used_seconds,
                active_started_at
            FROM guest_devices
            WHERE device_id = $1
            LIMIT 1
            `,
            [deviceId]
        );

    if (!result.rows[0]) {
        await client.query(
            `
            INSERT INTO guest_devices (
                device_id,
                used_seconds,
                active_started_at
            )
            VALUES ($1, 0, NULL)
            ON CONFLICT (device_id)
            DO NOTHING
            `,
            [deviceId]
        );

        return {
            deviceId,
            usedSeconds: 0,
            activeStartedAt: null
        };
    }

    const row = result.rows[0];

    let usedSeconds =
        Number(
            row.used_seconds || 0
        );

    if (row.active_started_at) {
        const activeStarted =
            new Date(
                row.active_started_at
            ).getTime();

        const elapsed =
            Math.max(
                0,
                Math.floor(
                    (
                        Date.now() -
                        activeStarted
                    ) / 1000
                )
            );

        usedSeconds += elapsed;
    }

    return {
        deviceId,
        usedSeconds: Math.min(
            guestLimitSeconds(),
            usedSeconds
        ),
        activeStartedAt:
            row.active_started_at
    };
}

function userAccess(user) {

    const now =
        Date.now();

    if (user.blocked) {

        return {
            mode: "blocked",
            active: false,
            plan: null,
            until: null
        };
    }

    if (
        user.subscriptionStatus ===
        "premium"
    ) {

        const expires =
            new Date(
                user.expiresAt || 0
            ).getTime();

        if (
            expires > now
        ) {

            return {
                mode: "premium",
                active: true,
                plan:
                    user.plan || null,
                until:
                    user.expiresAt
            };
        }

        user.subscriptionStatus =
            "expired";
    }

    if (
        user.subscriptionStatus ===
        "trial"
    ) {

        const trialUntil =
            new Date(
                user.trialUntil || 0
            ).getTime();

        if (
            trialUntil > now
        ) {

            return {
                mode: "trial",
                active: true,
                plan: null,
                until:
                    user.trialUntil
            };
        }

        user.subscriptionStatus =
            "expired";
    }

    return {
        mode: "expired",
        active: false,
        plan: null,
        until: null
    };
}

async function getAuthenticatedUser(req) {

    const token =
        req.headers.authorization
            ?.replace(
                /^Bearer\s+/i,
                ""
            ) ||
        req.headers["x-auth-token"];

    if (!token) {
        return null;
    }

    const userId =
        userSessions.get(token);

    if (!userId) {
        return null;
    }

    if (!pool) {
        return null;
    }

    const result = await pool.query(
        `
        SELECT
            id,
            full_name,
            email,
            phone,
            blocked,
            subscription_status,
            plan,
            created_at,
            trial_until,
            expires_at,
            speaking_count,
            legal_consent
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        blocked: row.blocked,
        subscriptionStatus: row.subscription_status,
        plan: row.plan,
        createdAt: row.created_at,
        trialUntil: row.trial_until,
        expiresAt: row.expires_at,
        speakingCount: row.speaking_count,
        legalConsent: row.legal_consent || {}
    };
}

// ==============================================
// LEARNER MEMORY
// ==============================================

async function ensureLearnerProfile(userId) {
    if (!pool || !userId) {
        return null;
    }

    await pool.query(
        `
        INSERT INTO learner_profiles (user_id)
        VALUES ($1)
        ON CONFLICT (user_id)
        DO NOTHING
        `,
        [userId]
    );

    const result = await pool.query(
        `
        SELECT
            user_id,
            cefr_level,
            learning_goal,
            preferred_language,
            current_topic,
            last_lesson_summary,
            updated_at
        FROM learner_profiles
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;
}

async function getLearnerMemory(userId) {
    if (!pool || !userId) {
        return null;
    }

    const profile = await ensureLearnerProfile(userId);

    const sessionsResult = await pool.query(
        `
        SELECT
            topic,
            level,
            summary,
            created_at
        FROM learning_sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5
        `,
        [userId]
    );

    const progressResult = await pool.query(
        `
        SELECT
            topic,
            skill,
            status,
            score,
            updated_at
        FROM learner_progress
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 20
        `,
        [userId]
    );

    const mistakesResult = await pool.query(
        `
        SELECT
            skill,
            category,
            mistake,
            correction,
            occurrence_count,
            last_seen_at
        FROM learner_mistakes
        WHERE user_id = $1
        ORDER BY occurrence_count DESC, last_seen_at DESC
        LIMIT 15
        `,
        [userId]
    );

    const vocabularyResult = await pool.query(
        `
        SELECT
            word,
            meaning,
            level,
            mastery,
            last_seen_at
        FROM learner_vocabulary
        WHERE user_id = $1
        ORDER BY last_seen_at DESC
        LIMIT 30
        `,
        [userId]
    );

    return {
        profile,
        sessions: sessionsResult.rows,
        progress: progressResult.rows,
        mistakes: mistakesResult.rows,
        vocabulary: vocabularyResult.rows
    };
}

function buildLearnerMemoryInstruction(memory) {
    if (!memory) {
        return "";
    }

    const profile = memory.profile || {};

    return `
LEARNER MEMORY:

CEFR darajasi:
${profile.cefr_level || "Hali aniqlanmagan"}

O‘rganish maqsadi:
${profile.learning_goal || "Hali aniqlanmagan"}

Joriy mavzu:
${profile.current_topic || "Hali aniqlanmagan"}

Oxirgi dars xulosasi:
${profile.last_lesson_summary || "Hali mavjud emas"}

Oxirgi darslar:
${JSON.stringify(memory.sessions || [])}

Progress:
${JSON.stringify(memory.progress || [])}

Takroriy xatolar:
${JSON.stringify(memory.mistakes || [])}

Vocabulary:
${JSON.stringify(memory.vocabulary || [])}

MEMORY QOIDALARI:

1. Foydalanuvchining ismini users.full_name orqali ishlating.

2. CEFR darajasi mavjud bo‘lsa, barcha material va mashqlarni shu darajaga moslang.

3. AGAR "Joriy mavzu" mavjud bo‘lsa va foydalanuvchi "davom etamiz", "davom etaylik", "darsni davom ettiraylik" yoki shunga teng mazmundagi iborani aytsa, YANGI MAVZU TANLAMANG. Aynan joriy mavzu va "Oxirgi dars xulosasi" asosida darsni davom ettiring.

4. "Davom etamiz" holatida avvalgi mavzuni kamida bir marta aniq eslatib o‘ting.

5. "Davom etamiz" holatida nazariyani boshidan takrorlamang. Keyingi mantiqiy bosqichga o‘ting: practice, speaking, questions, correction yoki qisqa test.

6. Oldingi xatolarni kerak bo‘lsa yangi mashqlarda tabiiy ravishda takrorlang.

7. Yangi mavzuga faqat foydalanuvchi yangi mavzu so‘raganda yoki aniq yangi mavzu berganda o‘ting.

8. Yangi mavzuga o‘tilsa, eski mavzuni memory'dan yo‘qotmang.

9. Memory'da ma'lumot bo‘lmasa, uni o‘ylab topmang.

10. CEFR darajasini dalilsiz o‘zgartirmang.

11. Foydalanuvchi yangi ma'lumot bersa, keyinchalik server uni memory'ga saqlashi kerak.

12. MEMORY'dagi "Oxirgi dars xulosasi", "Joriy mavzu" va "Progress" ma'lumotlarini oddiy salomlashuvdan ustun qo‘ying.

13. Javobni foydalanuvchining oldingi darsiga bog‘lang; umumiy "bugun nima o‘rganamiz?" savoliga o‘tib ketmang, agar davom ettirish signali berilgan bo‘lsa.
`;
}


async function saveLearnerMemory(userId, memory = {}) {
    if (!pool || !userId) {
        return;
    }

    const profile = memory.profile || {};

    await pool.query(
        `
        INSERT INTO learner_profiles (
            user_id,
            cefr_level,
            learning_goal,
            current_topic,
            last_lesson_summary,
            preferred_language,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            cefr_level = COALESCE(EXCLUDED.cefr_level, learner_profiles.cefr_level),
            learning_goal = COALESCE(EXCLUDED.learning_goal, learner_profiles.learning_goal),
            current_topic = COALESCE(EXCLUDED.current_topic, learner_profiles.current_topic),
            last_lesson_summary = COALESCE(EXCLUDED.last_lesson_summary, learner_profiles.last_lesson_summary),
            preferred_language = COALESCE(EXCLUDED.preferred_language, learner_profiles.preferred_language),
            updated_at = NOW()
        `,
        [
            userId,
            profile.cefr_level || null,
            profile.learning_goal || null,
            profile.current_topic || null,
            profile.last_lesson_summary || null,
            profile.preferred_language || null
        ]
    );

    if (
        memory.session &&
        (memory.session.topic || memory.session.summary)
    ) {
        await pool.query(
            `
            INSERT INTO learning_sessions (
                user_id,
                topic,
                level,
                summary
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
                userId,
                memory.session.topic || null,
                memory.session.level || profile.cefr_level || null,
                memory.session.summary || null
            ]
        );
    }

    for (const item of memory.progress || []) {
        if (!item?.topic || !item?.skill) {
            continue;
        }

        await pool.query(
            `
            INSERT INTO learner_progress (
                user_id,
                topic,
                skill,
                status,
                score,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, topic, skill)
            DO UPDATE SET
                status = EXCLUDED.status,
                score = EXCLUDED.score,
                updated_at = NOW()
            `,
            [
                userId,
                item.topic,
                item.skill,
                item.status || "started",
                item.score ?? null
            ]
        );
    }

    for (const item of memory.mistakes || []) {
        if (!item?.skill || !item?.mistake) {
            continue;
        }

        await pool.query(
            `
            INSERT INTO learner_mistakes (
                user_id,
                skill,
                category,
                mistake,
                correction,
                occurrence_count,
                last_seen_at
            )
            VALUES ($1, $2, $3, $4, $5, 1, NOW())
            `,
            [
                userId,
                item.skill,
                item.category || null,
                item.mistake,
                item.correction || null
            ]
        );
    }

    for (const item of memory.vocabulary || []) {
        if (!item?.word) {
            continue;
        }

        await pool.query(
            `
            INSERT INTO learner_vocabulary (
                user_id,
                word,
                meaning,
                level,
                mastery,
                last_seen_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, word)
            DO UPDATE SET
                meaning = COALESCE(EXCLUDED.meaning, learner_vocabulary.meaning),
                level = COALESCE(EXCLUDED.level, learner_vocabulary.level),
                mastery = EXCLUDED.mastery,
                last_seen_at = NOW()
            `,
            [
                userId,
                item.word,
                item.meaning || null,
                item.level || profile.cefr_level || null,
                Number.isFinite(Number(item.mastery))
                    ? Number(item.mastery)
                    : 0
            ]
        );
    }
}


function detectExplicitLearningLanguage(message) {
    const value = String(message || "").trim().toLowerCase();
    if (!value) return null;
    const languages = [
        ["Uzbek", /(?:uzbek|o['’‘]?zbek(?:cha)?|o'zbek tili|uzbek tili)/i],
        ["English", /(?:english|ingliz(?:cha)?|ingliz tili)/i],
        ["German", /(?:german|nemis(?:cha)?|nemis tili)/i],
        ["Arabic", /(?:arabic|arab(?:cha)?|arab tili)/i],
        ["Russian", /(?:russian|rus(?:cha)?|rus tili)/i],
        ["Turkish", /(?:turkish|turk(?:cha)?|turk tili)/i],
        ["Korean", /(?:korean|koreys(?:cha)?|koreys tili)/i],
        ["Chinese", /(?:chinese|xitoy(?:cha)?|xitoy tili)/i]
    ];
    const bareChoice = /^(uzbek|o['’‘]?zbek(cha)?|o'zbek tili|uzbek tili|english|ingliz(cha)?|ingliz tili|german|nemis(cha)?|nemis tili|arabic|arab(cha)?|arab tili|russian|rus(cha)?|rus tili|turkish|turk(cha)?|turk tili|korean|koreys(cha)?|koreys tili|chinese|xitoy(cha)?|xitoy tili)[.! ]*$/i.test(value);
    const explicitLearning = /(?:o'rgan|organ|boshl|tanla|davom|teach me|learn|study|start learning)/i.test(value);
    if (!bareChoice && !explicitLearning) return null;
    return languages.find(([, pattern]) => pattern.test(value))?.[0] || null;
}

async function updateLearnerMemoryFromChat(userId, message, reply, existingMemory = null) {
    if (!pool || !userId) return null;

    const profile = existingMemory?.profile || {};
    const normalizedMessage = String(message || "").trim();
    const normalizedReply = String(reply || "").trim();
    if (!normalizedMessage || !normalizedReply) return null;

    const topic = profile.current_topic || null;
    const level = profile.cefr_level || null;
    const preferredLanguage =
        detectExplicitLearningLanguage(normalizedMessage) ||
        profile.preferred_language ||
        null;
    const summary = topic
        ? `${topic} bo‘yicha dars davom ettirildi. O‘quvchi yangi mashq bajardi va Teacher Hasan javob berdi.`
        : null;

    if (!topic && !level && !preferredLanguage) return null;

    await pool.query(
        `
        INSERT INTO learner_profiles (
            user_id, cefr_level, current_topic, last_lesson_summary,
            preferred_language, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            cefr_level = COALESCE(EXCLUDED.cefr_level, learner_profiles.cefr_level),
            current_topic = COALESCE(EXCLUDED.current_topic, learner_profiles.current_topic),
            last_lesson_summary = COALESCE(EXCLUDED.last_lesson_summary, learner_profiles.last_lesson_summary),
            preferred_language = COALESCE(EXCLUDED.preferred_language, learner_profiles.preferred_language),
            updated_at = NOW()
        `,
        [userId, level, topic, summary, preferredLanguage]
    );

    if (topic) {
        await pool.query(
            `
            INSERT INTO learning_sessions (user_id, topic, level, summary)
            VALUES ($1, $2, $3, $4)
            `,
            [userId, topic, level, summary]
        );
    }

    console.log("💾 LEARNER MEMORY SAVED:", {
        userId, topic, level, preferredLanguage
    });

    return { topic, level, summary, preferredLanguage };
}

async function extractLearnerMemory(userId, message, reply, existingMemory = null) {
    console.log("🧠 MEMORY EXTRACTOR START:", userId);

    if (!pool || !userId || !ai) {
        return null;
    }

    const profile = existingMemory?.profile || {};

    const prompt = `
Siz Teacher Hasan AI platformasi uchun learner memory extractor'siz.

Vazifa:
Foydalanuvchining hozirgi xabari va Teacher Hasan javobidan FAQAT ishonchli,
foydalanuvchi aytgan yoki suhbatdan bevosita aniqlangan o‘quv ma'lumotlarini ajrating.

HECH QACHON:
- foydalanuvchi aytmagan CEFR darajasini o‘ylab topmang;
- foydalanuvchi aytmagan maqsadni o‘ylab topmang;
- taxminiy xatoni haqiqiy xato deb yozmang;
- taxminiy vocabulary qo‘shmang;
- bo‘sh ma'lumotni uydirmang.

Mavjud learner xotirasi (profil, oxirgi darslar, progress, xatolar va vocabulary):
${JSON.stringify(existingMemory || { profile })}

Foydalanuvchi xabari:
${message}

Teacher Hasan javobi:
${reply}

JSON faqat quyidagi strukturada bo‘lsin:
{
  "profile": {
    "cefr_level": null,
    "learning_goal": null,
    "current_topic": null,
    "last_lesson_summary": null,
    "preferred_language": null
  },
  "session": {
    "topic": null,
    "level": null,
    "summary": null
  },
  "progress": [],
  "mistakes": [],
  "vocabulary": []
}

Qoidalar:
- Mavjud learner xotirasini saqlang; yangi xabarda takrorlanmagan eski ma'lumotlarni yo'qotmang.
- Faqat yangi yoki aniq tasdiqlangan ma'lumotni qaytaring.
- Foydalanuvchi "davom etamiz" desa, oldingi current_topic va oxirgi dars xulosasini saqlang; yangi mavzu deb almashtirmang.
- last_lesson_summary darsda aynan nimalar bajarilgani va keyingi mantiqiy qadamni qisqa qayd etsin.
- Har bir yangi o'quv suhbati uchun session.summary mavzu, bajarilgan ish va keyingi qadamni aniq ifodalasin.
- cefr_level faqat foydalanuvchi darajasini aniq aytsa yoki Teacher Hasan uni aniq baholagan bo‘lsa yozilsin.
- learning_goal faqat aniq aytilgan maqsad bo‘lsa yozilsin.
- current_topic suhbatning real o‘quv mavzusi bo‘lsa yozilsin.
- preferred_language faqat foydalanuvchi qaysi tilni o‘rganishini aniq tanlaganida yozilsin; oddiy muloqot tilini preferred_language deb saqlamang.
- Foydalanuvchi boshqa tilni aniq so‘rasa, preferred_language ni shu tilga yangilang; aks holda mavjud tilni null bilan almashtirmang.
- session.summary qisqa bo‘lsin.
- progress faqat real bajarilgan mashq yoki skill bo‘yicha ma'lumot bo‘lsa yozilsin.
- mistakes faqat foydalanuvchining real ingliz tili xatosi aniq ko‘ringanda yozilsin.
- vocabulary faqat shu suhbatda o‘rganilgan yoki aniq ishlatilgan muhim so‘zlar bo‘lsa yozilsin.
- Keraksiz ma'lumot uchun null yoki [] qaytaring.
`;

    try {
        const result = await generateGeminiWithRetry({
            model: CHAT_MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseJsonSchema: {
                    type: "object",
                    properties: {
                        profile: {
                            type: "object",
                            properties: {
                                cefr_level: { type: ["string", "null"] },
                                learning_goal: { type: ["string", "null"] },
                                current_topic: { type: ["string", "null"] },
                                last_lesson_summary: { type: ["string", "null"] },
                                preferred_language: { type: ["string", "null"] }
                            },
                            required: [
                                "cefr_level",
                                "learning_goal",
                                "current_topic",
                                "last_lesson_summary",
                                "preferred_language"
                            ]
                        },
                        session: {
                            type: "object",
                            properties: {
                                topic: { type: ["string", "null"] },
                                level: { type: ["string", "null"] },
                                summary: { type: ["string", "null"] }
                            },
                            required: ["topic", "level", "summary"]
                        },
                        progress: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    topic: { type: "string" },
                                    skill: { type: "string" },
                                    status: { type: "string" },
                                    score: { type: ["number", "null"] }
                                },
                                required: ["topic", "skill", "status", "score"]
                            }
                        },
                        mistakes: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    skill: { type: "string" },
                                    category: { type: ["string", "null"] },
                                    mistake: { type: "string" },
                                    correction: { type: ["string", "null"] }
                                },
                                required: [
                                    "skill",
                                    "category",
                                    "mistake",
                                    "correction"
                                ]
                            }
                        },
                        vocabulary: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    word: { type: "string" },
                                    meaning: { type: ["string", "null"] },
                                    level: { type: ["string", "null"] },
                                    mastery: { type: ["number", "null"] }
                                },
                                required: [
                                    "word",
                                    "meaning",
                                    "level",
                                    "mastery"
                                ]
                            }
                        }
                    },
                    required: [
                        "profile",
                        "session",
                        "progress",
                        "mistakes",
                        "vocabulary"
                    ]
                }
            }
        });

        const raw = result.text || "{}";
        const memory = JSON.parse(raw);
        console.log("🧠 LEARNER MEMORY RAW:", raw);
        console.log("🧠 LEARNER MEMORY PARSED:", JSON.stringify(memory));

        await saveLearnerMemory(userId, memory);

        return memory;
    } catch (error) {
        console.error(
            "⚠️ LEARNER MEMORY XATOSI:",
            error?.message || error
        );
        return null;
    }
}

let multicardTokenCache = {
    token: "",
    expiresAt: 0
};

async function getMulticardToken(forceRefresh = false) {
    const now = Date.now();

    // Token hali amal qilayotgan bo‘lsa, cache'dan foydalanamiz.
    // 5 daqiqalik xavfsizlik zaxirasi qoldiramiz.
    if (
        !forceRefresh &&
        multicardTokenCache.token &&
        multicardTokenCache.expiresAt > now + 5 * 60 * 1000
    ) {
        return multicardTokenCache.token;
    }

    if (!MULTICARD_APPLICATION_ID) {
        throw new Error(
            "MULTICARD_APPLICATION_ID .env faylida mavjud emas."
        );
    }

    if (!MULTICARD_APPLICATION_SECRET) {
        throw new Error(
            "MULTICARD_APPLICATION_SECRET .env faylida mavjud emas."
        );
    }

    const response = await fetch(
        `${MULTICARD_API_URL}/auth`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                application_id: MULTICARD_APPLICATION_ID,
                secret: MULTICARD_APPLICATION_SECRET
            })
        }
    );

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Multicard /auth JSON javob qaytarmadi. HTTP status: ${response.status}`
        );
    }

    console.log(
        "MULTICARD AUTH:",
        {
            success: response.ok,
            expiry: data?.expiry
        }
    );

    if (!response.ok || !data?.token) {
        throw new Error(
            data?.message ||
            data?.error?.message ||
            "Multicard token olishda xatolik."
        );
    }

    const expiryTime = data.expiry
        ? new Date(data.expiry).getTime()
        : Date.now() + 23 * 60 * 60 * 1000;

    multicardTokenCache = {
        token: data.token,
        expiresAt: expiryTime
    };

    return data.token;
}
async function createMulticardInvoice({
    invoiceId,
    amount
}) {
    if (!MULTICARD_STORE_ID) {
        throw new Error(
            "MULTICARD_STORE_ID .env faylida mavjud emas."
        );
    }

    async function sendInvoiceRequest(token) {
    return fetch(
        `${MULTICARD_API_URL}/payment/invoice`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                store_id: MULTICARD_STORE_ID,
                amount: Math.round(Number(amount) * 100),
                invoice_id: invoiceId,
                lang: "uz",
                return_url: MULTICARD_RETURN_URL,
                callback_url: MULTICARD_CALLBACK_URL
            })
        }
    );
}

    // 1. Cache'dagi mavjud tokenni olish
    let token = await getMulticardToken();

    let response = await sendInvoiceRequest(token);

    // 2. Token expire bo‘lgan bo‘lsa:
    // yangi token olib, requestni faqat bir marta qayta yuboramiz.
    if (response.status === 401) {
        console.log(
            "Multicard token eskirgan. Yangi token olinmoqda..."
        );

        token = await getMulticardToken(true);

        response = await sendInvoiceRequest(token);
    }

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Multicard server JSON javob qaytarmadi. HTTP status: ${response.status}`
        );
    }

    console.log("MULTICARD INVOICE RESPONSE:", {
        status: response.status,
        ok: response.ok,
        success: data?.success,
        data: data?.data
            ? {
                uuid: data.data.uuid,
                invoice_id: data.data.invoice_id,
                checkout_url: data.data.checkout_url
            }
            : null,
        error: data?.error,
        message: data?.message
    });

    if (!response.ok || !data.success) {
        throw new Error(
            data?.error?.message ||
            data?.message ||
            "Multicard invoice yaratilmadi."
        );
    }

    if (!data.data?.checkout_url) {
        throw new Error(
            "Multicard checkout_url qaytarmadi."
        );
    }

    return data.data;
}

// ==============================================// HOME
// ==============================================
app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});


// ==============================================// ADMIN PAGE
// ==============================================
app.get("/admin", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "admin.html"
        )
    );
});


// ==============================================// HEALTH
// ==============================================
app.get("/api/health", (req, res) => {

    res.json({

        ok: true,

        name:
            "Teacher Hasan",

        gemini:
            Boolean(
                GEMINI_API_KEY
            ),

        liveModel:
            LIVE_MODEL,

        chatModel:
            CHAT_MODEL
    });
});


// ==============================================// REGISTER
// ==============================================
app.post(

    "/api/auth/register",

    async (req, res) => {

        try {

            const fullName =
                String(
                    req.body?.fullName ||
                    ""
                ).trim();

            const email =
                normalizeEmail(
                    req.body?.email
                );

            const phone =
                normalizePhone(
                    req.body?.phone
                );

            const password =
                String(
                    req.body?.password ||
                    ""
                );

            const legalAccepted =
                req.body?.legalAccepted === true ||
                req.body?.legalAccepted === "true" ||
                req.body?.legalAccepted === "on";

            if (!legalAccepted) {
                return res.status(400)
                    .json({
                        error:
                            "Ro‘yxatdan o‘tish uchun Ommaviy oferta va Maxfiylik siyosatini qabul qilishingiz kerak."
                    });
            }

            if (!fullName) {
                return res.status(400)
                    .json({
                        error:
                            "Ism va familiya kiritilishi kerak."
                    });
            }

            if (!email && !phone) {
                return res.status(400)
                    .json({
                        error:
                            "Email yoki telefon raqam kiriting."
                    });
            }

            if (password.length < 6) {
                return res.status(400)
                    .json({
                        error:
                            "Parol kamida 6 belgidan iborat bo‘lishi kerak."
                    });
            }

            const createdAt = new Date();

            const trialUntil =
                new Date(
                    createdAt.getTime() +
                    TRIAL_DAYS *
                    24 *
                    60 *
                    60 *
                    1000
                );

            const userId =
                crypto.randomUUID();

            const legalConsent = {
                accepted: true,
                acceptedAt:
                    createdAt.toISOString(),
                privacyPolicyVersion:
                    PRIVACY_POLICY_VERSION,
                offerVersion:
                    OFFER_VERSION
            };

            let result;

            try {

                result = await pool.query(
                    `
                    INSERT INTO users (
                        id,
                        full_name,
                        email,
                        phone,
                        password_hash,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        FALSE,
                        'trial',
                        NULL,
                        $6,
                        $7,
                        NULL,
                        0,
                        $8::jsonb
                    )
                    RETURNING
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    `,
                    [
                        userId,
                        fullName,
                        email || "",
                        phone || "",
                        hashPassword(password),
                        createdAt,
                        trialUntil,
                        JSON.stringify(legalConsent)
                    ]
                );

            } catch (error) {

                if (error.code === "23505") {
                    return res.status(409)
                        .json({
                            error:
                                "Bu email yoki telefon bilan akkaunt allaqachon mavjud."
                        });
                }

                throw error;
            }

            const row =
                result.rows[0];

            const user = {
                id:
                    row.id,

                fullName:
                    row.full_name,

                email:
                    row.email || "",

                phone:
                    row.phone || "",

                passwordHash:
                    hashPassword(password),

                blocked:
                    row.blocked,

                subscriptionStatus:
                    row.subscription_status,

                plan:
                    row.plan,

                createdAt:
                    row.created_at?.toISOString?.() ||
                    row.created_at,

                trialUntil:
                    row.trial_until?.toISOString?.() ||
                    row.trial_until,

                expiresAt:
                    row.expires_at
                        ? (
                            row.expires_at?.toISOString?.() ||
                            row.expires_at
                        )
                        : null,

                speakingCount:
                    row.speaking_count || 0,

                legalConsent:
                    row.legal_consent ||
                    legalConsent
            };

            const token =
                generateToken();

            userSessions.set(
                token,
                user.id
            );

            console.log(
                "✅ Yangi user:",
                user.fullName
            );

            return res.json({
                success: true,
                token,
                user: {
                    id:
                        user.id,
                    fullName:
                        user.fullName,
                    email:
                        user.email,
                    phone:
                        user.phone
                },
                access:
                    userAccess(user)
            });

        } catch (error) {

            console.error(
                "REGISTER ERROR:",
                error
            );

            return res.status(500)
                .json({
                    error:
                        "Ro‘yxatdan o‘tishda xatolik."
                });
        }
    }

);


app.post(

    "/api/auth/login",

    async (req, res) => {

        try {

            const identifier =
                String(
                    req.body?.identifier ||
                    ""
                ).trim();

            const password =
                String(
                    req.body?.password ||
                    ""
                );

            if (!identifier || !password) {
                return res.status(400)
                    .json({
                        error:
                            "Login va parolni kiriting."
                    });
            }

            const normalizedEmail =
                normalizeEmail(
                    identifier
                );

            const normalizedPhone =
                normalizePhone(
                    identifier
                );

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        phone,
                        password_hash,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    FROM users
                    WHERE
                        (
                            $1 <> ''
                            AND LOWER(email) = LOWER($1)
                        )
                        OR
                        (
                            $2 <> ''
                            AND phone = $2
                        )
                    LIMIT 1
                    `,
                    [
                        normalizedEmail || "",
                        normalizedPhone || ""
                    ]
                );

            if (result.rows.length === 0) {
                return res.status(401)
                    .json({
                        error:
                            "Foydalanuvchi topilmadi."
                    });
            }

            const row =
                result.rows[0];

            if (
                row.password_hash !==
                hashPassword(password)
            ) {
                return res.status(401)
                    .json({
                        error:
                            "Login yoki parol noto‘g‘ri."
                    });
            }

            if (row.blocked) {
                return res.status(403)
                    .json({
                        error:
                            "Akkauntingiz bloklangan."
                    });
            }

            const user = {
                id:
                    row.id,

                fullName:
                    row.full_name,

                email:
                    row.email || "",

                phone:
                    row.phone || "",

                passwordHash:
                    row.password_hash,

                blocked:
                    row.blocked,

                subscriptionStatus:
                    row.subscription_status,

                plan:
                    row.plan,

                createdAt:
                    row.created_at?.toISOString?.() ||
                    row.created_at,

                trialUntil:
                    row.trial_until?.toISOString?.() ||
                    row.trial_until,

                expiresAt:
                    row.expires_at
                        ? (
                            row.expires_at?.toISOString?.() ||
                            row.expires_at
                        )
                        : null,

                speakingCount:
                    row.speaking_count || 0,

                legalConsent:
                    row.legal_consent || {}
            };

            const token =
                generateToken();

            userSessions.set(
                token,
                user.id
            );

            return res.json({
                success: true,
                token,
                user: {
                    id:
                        user.id,
                    fullName:
                        user.fullName,
                    email:
                        user.email,
                    phone:
                        user.phone
                },
                access:
                    userAccess(user)
            });

        } catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );

            return res.status(500)
                .json({
                    error:
                        "Kirishda xatolik."
                });
        }
    }
);



// ==============================================
// FORGOT PASSWORD
// ==============================================

app.post(
    "/api/auth/forgot-password",
    async (req, res) => {
        try {
            const email =
                normalizeEmail(req.body?.email);

            // User mavjud yoki yo‘qligini oshkor qilmaymiz.
            const genericResponse = {
                success: true,
                message:
                    "Agar ushbu email Teacher Hasan akkauntiga tegishli bo‘lsa, parolni almashtirish havolasi yuborildi."
            };

            if (!email) {
                return res.json(genericResponse);
            }

            if (!pool) {
                return res.status(500).json({
                    success: false,
                    error:
                        "PostgreSQL mavjud emas."
                });
            }

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email
                    FROM users
                    WHERE LOWER(email) = LOWER($1)
                    LIMIT 1
                    `,
                    [email]
                );

            const user =
                result.rows[0];

            if (!user || !user.email) {
                return res.json(
                    genericResponse
                );
            }

            const rawToken =
                crypto
                    .randomBytes(32)
                    .toString("hex");

            const tokenHash =
                hashResetToken(
                    rawToken
                );

            const expiresAt =
                new Date(
                    Date.now() +
                    15 * 60 * 1000
                );

            await pool.query(
                `
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE user_id = $1
                  AND used_at IS NULL
                `,
                [user.id]
            );

            await pool.query(
                `
                INSERT INTO password_reset_tokens (
                    user_id,
                    token_hash,
                    expires_at
                )
                VALUES ($1, $2, $3)
                `,
                [
                    user.id,
                    tokenHash,
                    expiresAt
                ]
            );

            await sendPasswordResetEmail({
                email: user.email,
                fullName: user.full_name,
                token: rawToken
            });

            return res.json(
                genericResponse
            );

        } catch (error) {
            console.error(
                "FORGOT PASSWORD ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Parolni tiklash emailini yuborishda xatolik."
            });
        }
    }
);

// ==============================================
// RESET PASSWORD
// ==============================================

app.post(
    "/api/auth/reset-password",
    async (req, res) => {
        const token =
            String(
                req.body?.token || ""
            ).trim();

        const newPassword =
            String(
                req.body?.password || ""
            );

        if (!token) {
            return res.status(400).json({
                success: false,
                error:
                    "Parolni tiklash tokeni mavjud emas."
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error:
                    "Yangi parol kamida 6 belgidan iborat bo‘lishi kerak."
            });
        }

        if (!pool) {
            return res.status(500).json({
                success: false,
                error:
                    "PostgreSQL mavjud emas."
            });
        }

        try {
            const tokenHash =
                hashResetToken(token);

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        expires_at,
                        used_at
                    FROM password_reset_tokens
                    WHERE token_hash = $1
                    LIMIT 1
                    `,
                    [tokenHash]
                );

            const reset =
                result.rows[0];

            if (
                !reset ||
                reset.used_at ||
                new Date(reset.expires_at).getTime() < Date.now()
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Parolni almashtirish havolasi yaroqsiz yoki muddati tugagan."
                });
            }

            await pool.query(
                `
                UPDATE users
                SET password_hash = $1
                WHERE id = $2
                `,
                [
                    hashPassword(
                        newPassword
                    ),
                    reset.user_id
                ]
            );

            await pool.query(
                `
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE id = $1
                `,
                [reset.id]
            );

            // Barcha eski sessionlarni bekor qilamiz.
            for (
                const [
                    sessionToken,
                    userId
                ] of userSessions.entries()
            ) {
                if (
                    String(userId) ===
                    String(reset.user_id)
                ) {
                    userSessions.delete(
                        sessionToken
                    );
                }
            }

            return res.json({
                success: true,
                message:
                    "Parol muvaffaqiyatli almashtirildi."
            });

        } catch (error) {
            console.error(
                "RESET PASSWORD ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Parolni almashtirishda xatolik."
            });
        }
    }
);


// ==============================================
// CHANGE PASSWORD
// ==============================================

app.post(
    "/api/auth/change-password",
    async (req, res) => {
        try {
            if (!pool) {
                return res.status(500).json({
                    success: false,
                    error: "PostgreSQL mavjud emas."
                });
            }

            const currentPassword = String(
                req.body?.currentPassword || ""
            );

            const newPassword = String(
                req.body?.newPassword || ""
            );

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: "Eski va yangi parolni kiriting."
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Yangi parol kamida 6 belgidan iborat bo‘lishi kerak."
                });
            }

            if (currentPassword === newPassword) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Yangi parol eski paroldan farq qilishi kerak."
                });
            }

            // Joriy Bearer session orqali foydalanuvchini aniqlaymiz.
            const token =
                req.headers.authorization
                    ?.replace(/^Bearer\s+/i, "")
                    ||
                req.headers["x-auth-token"];

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error:
                        "Avval akkauntingizga kiring."
                });
            }

            const userId = userSessions.get(token);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error:
                        "Sessiya yaroqsiz yoki muddati tugagan."
                });
            }

            const result = await pool.query(
                `
                SELECT
                    id,
                    password_hash,
                    blocked
                FROM users
                WHERE id = $1
                LIMIT 1
                `,
                [userId]
            );

            const row = result.rows[0];

            if (!row) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Foydalanuvchi topilmadi."
                });
            }

            if (row.blocked) {
                return res.status(403).json({
                    success: false,
                    error:
                        "Akkauntingiz bloklangan."
                });
            }

            // Eski parolni serverdagi mavjud SHA-256
            // mexanizmi bilan tekshiramiz.
            if (
                row.password_hash !==
                hashPassword(currentPassword)
            ) {
                return res.status(401).json({
                    success: false,
                    error:
                        "Eski parol noto‘g‘ri."
                });
            }

            const newPasswordHash =
                hashPassword(newPassword);

            await pool.query(
                `
                UPDATE users
                SET password_hash = $1
                WHERE id = $2
                `,
                [
                    newPasswordHash,
                    userId
                ]
            );

            // Xavfsizlik uchun boshqa eski sessionlarni
            // bekor qilamiz, lekin hozirgi sessionni
            // saqlab qolamiz.
            for (
                const [
                    sessionToken,
                    sessionUserId
                ] of userSessions.entries()
            ) {
                if (
                    String(sessionUserId) ===
                        String(userId) &&
                    sessionToken !== token
                ) {
                    userSessions.delete(
                        sessionToken
                    );
                }
            }

            return res.json({
                success: true,
                message:
                    "Parol muvaffaqiyatli o‘zgartirildi."
            });

        } catch (error) {
            console.error(
                "CHANGE PASSWORD ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Parolni o‘zgartirishda xatolik."
            });
        }
    }
);


app.post(
    "/api/auth/logout",
    (req, res) => {

        const token =
            req.headers.authorization
                ?.replace(
                    /^Bearer\s+/i,
                    ""
                ) ||
            req.headers["x-auth-token"];

        if (token) {
            userSessions.delete(
                token
            );
        }

        res.json({
            success: true
        });
    }
);


// ==============================================// CURRENT USER
// ==============================================
app.get(
    "/api/me",
    async (req, res) => {

        const user =
            await getAuthenticatedUser(
                req
            );

        if (!user) {

            return res.json({
                authenticated:
                    false
            });
        }

        const access =
            userAccess(user);
return res.json({

            authenticated:
                true,

            user: {

                id:
                    user.id,

                fullName:
                    user.fullName,

                email:
                    user.email,

                phone:
                    user.phone,

                createdAt:
                    user.createdAt
            },

            access
        });
    }
);


// ==============================================
// GUEST SESSION
// ==============================================

app.post(
    "/api/guest/start",
    async (req, res) => {
        const authenticatedUser =
            await getAuthenticatedUser(req);

        if (authenticatedUser) {
            const access =
                userAccess(
                    authenticatedUser
                );

            if (access.mode === "blocked") {
                return res.status(403).json({
                    success: false,
                    authenticated: true,
                    mode: "blocked",
                    code: "blocked",
                    error:
                        "Hisobingiz bloklangan."
                });
            }

            if (!access.active) {
                return res.status(403).json({
                    success: false,
                    authenticated: true,
                    mode: "expired",
                    code: "expired",
                    error:
                        "Trial yoki Premium muddati tugagan. Davom etish uchun Premium obuna qiling."
                });
            }

            return res.json({
                success: true,
                authenticated: true,
                mode: access.mode,
                active: true,
                plan:
                    access.plan || null,
                until:
                    access.until || null,
                remainingSeconds: null
            });
        }

        if (!pool) {
            return res.status(500).json({
                success: false,
                error: "PostgreSQL mavjud emas."
            });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const deviceId =
                getGuestDeviceId(
                    req,
                    res
                );

            const result =
                await client.query(
                    `
                    SELECT
                        device_id,
                        used_seconds,
                        active_started_at
                    FROM guest_devices
                    WHERE device_id = $1
                    FOR UPDATE
                    `,
                    [deviceId]
                );

            let row = result.rows[0];

            if (!row) {
                await client.query(
                    `
                    INSERT INTO guest_devices (
                        device_id,
                        used_seconds,
                        active_started_at
                    )
                    VALUES ($1, 0, NOW())
                    `,
                    [deviceId]
                );

                await client.query(
                    "COMMIT"
                );

                return res.json({
                    success: true,
                    active: true,
                    usedSeconds: 0,
                    remainingSeconds:
                        guestLimitSeconds(),
                    limitSeconds:
                        guestLimitSeconds()
                });
            }

            let usedSeconds =
                Number(
                    row.used_seconds || 0
                );

            if (row.active_started_at) {
                const activeStarted =
                    new Date(
                        row.active_started_at
                    ).getTime();

                const elapsed =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                Date.now() -
                                activeStarted
                            ) / 1000
                        )
                    );

                usedSeconds += elapsed;
            }

            usedSeconds = Math.min(
                guestLimitSeconds(),
                usedSeconds
            );

            if (
                usedSeconds >=
                guestLimitSeconds()
            ) {
                await client.query(
                    `
                    UPDATE guest_devices
                    SET
                        used_seconds = $1,
                        active_started_at = NULL,
                        updated_at = NOW()
                    WHERE device_id = $2
                    `,
                    [
                        usedSeconds,
                        deviceId
                    ]
                );

                await client.query(
                    "COMMIT"
                );

                return res.status(403)
                    .json({
                        success: false,
                        active: false,
                        exhausted: true,
                        usedSeconds,
                        remainingSeconds: 0,
                        limitSeconds:
                            guestLimitSeconds(),
                        error:
                            "Guest vaqti tugagan. Iltimos, Login yoki Register qiling."
                    });
            }

            await client.query(
                `
                UPDATE guest_devices
                SET
                    used_seconds = $1,
                    active_started_at = NOW(),
                    updated_at = NOW()
                WHERE device_id = $2
                `,
                [
                    usedSeconds,
                    deviceId
                ]
            );

            await client.query(
                "COMMIT"
            );

            return res.json({
                success: true,
                active: true,
                usedSeconds,
                remainingSeconds:
                    Math.max(
                        0,
                        guestLimitSeconds() -
                        usedSeconds
                    ),
                limitSeconds:
                    guestLimitSeconds()
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "❌ Guest start xatosi:",
                error?.message
            );

            return res.status(500)
                .json({
                    success: false,
                    error:
                        "Guest sessiyasini boshlashda xato."
                });
        } finally {
            client.release();
        }
    }
);

app.post(
    "/api/guest/heartbeat",
    async (req, res) => {
        const authenticatedUser =
            await getAuthenticatedUser(req);

        if (authenticatedUser) {
            return res.status(403).json({
                success: false,
                authenticated: true,
                code: "authenticated",
                error:
                    "Authenticated foydalanuvchi guest sessiyasidan foydalana olmaydi."
            });
        }

        if (!pool) {
            return res.status(500).json({
                success: false,
                error: "PostgreSQL mavjud emas."
            });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const deviceId =
                getGuestDeviceId(
                    req,
                    res
                );

            const result =
                await client.query(
                    `
                    SELECT
                        used_seconds,
                        active_started_at
                    FROM guest_devices
                    WHERE device_id = $1
                    FOR UPDATE
                    `,
                    [deviceId]
                );

            const row =
                result.rows[0];

            if (!row) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(404)
                    .json({
                        success: false,
                        error:
                            "Guest qurilmasi topilmadi."
                    });
            }

            let usedSeconds =
                Number(
                    row.used_seconds || 0
                );

            if (row.active_started_at) {
                const activeStarted =
                    new Date(
                        row.active_started_at
                    ).getTime();

                const elapsed =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                Date.now() -
                                activeStarted
                            ) / 1000
                        )
                    );

                usedSeconds += elapsed;
            }

            usedSeconds = Math.min(
                guestLimitSeconds(),
                usedSeconds
            );

            const exhausted =
                usedSeconds >=
                guestLimitSeconds();

            await client.query(
                `
                UPDATE guest_devices
                SET
                    used_seconds = $1,
                    active_started_at = $2,
                    updated_at = NOW()
                WHERE device_id = $3
                `,
                [
                    usedSeconds,
                    exhausted
                        ? null
                        : new Date(),
                    deviceId
                ]
            );

            await client.query(
                "COMMIT"
            );

            return res.json({
                success: true,
                active: !exhausted,
                exhausted,
                usedSeconds,
                remainingSeconds:
                    Math.max(
                        0,
                        guestLimitSeconds() -
                        usedSeconds
                    ),
                limitSeconds:
                    guestLimitSeconds()
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "❌ Guest heartbeat xatosi:",
                error?.message
            );

            return res.status(500)
                .json({
                    success: false,
                    error:
                        "Guest vaqtini yangilashda xato."
                });
        } finally {
            client.release();
        }
    }
);

app.post(
    "/api/guest/stop",
    async (req, res) => {
        const authenticatedUser =
            await getAuthenticatedUser(req);

        if (authenticatedUser) {
            return res.status(403).json({
                success: false,
                authenticated: true,
                code: "authenticated",
                error:
                    "Authenticated foydalanuvchi guest sessiyasidan foydalana olmaydi."
            });
        }

        if (!pool) {
            return res.status(500).json({
                success: false,
                error: "PostgreSQL mavjud emas."
            });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const deviceId =
                getGuestDeviceId(
                    req,
                    res
                );

            const result =
                await client.query(
                    `
                    SELECT
                        used_seconds,
                        active_started_at
                    FROM guest_devices
                    WHERE device_id = $1
                    FOR UPDATE
                    `,
                    [deviceId]
                );

            const row =
                result.rows[0];

            if (!row) {
                await client.query(
                    "ROLLBACK"
                );

                return res.json({
                    success: true,
                    active: false,
                    usedSeconds: 0,
                    remainingSeconds:
                        guestLimitSeconds()
                });
            }

            let usedSeconds =
                Number(
                    row.used_seconds || 0
                );

            if (row.active_started_at) {
                const activeStarted =
                    new Date(
                        row.active_started_at
                    ).getTime();

                const elapsed =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                Date.now() -
                                activeStarted
                            ) / 1000
                        )
                    );

                usedSeconds += elapsed;
            }

            usedSeconds = Math.min(
                guestLimitSeconds(),
                usedSeconds
            );

            await client.query(
                `
                UPDATE guest_devices
                SET
                    used_seconds = $1,
                    active_started_at = NULL,
                    updated_at = NOW()
                WHERE device_id = $2
                `,
                [
                    usedSeconds,
                    deviceId
                ]
            );

            await client.query(
                "COMMIT"
            );

            return res.json({
                success: true,
                active: false,
                exhausted:
                    usedSeconds >=
                    guestLimitSeconds(),
                usedSeconds,
                remainingSeconds:
                    Math.max(
                        0,
                        guestLimitSeconds() -
                        usedSeconds
                    ),
                limitSeconds:
                    guestLimitSeconds()
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "❌ Guest stop xatosi:",
                error?.message
            );

            return res.status(500)
                .json({
                    success: false,
                    error:
                        "Guest sessiyasini to‘xtatishda xato."
                });
        } finally {
            client.release();
        }
    }
);

app.get(
    "/api/guest/status",
    async (req, res) => {
        if (!pool) {
            return res.status(500).json({
                active: false,
                error: "PostgreSQL mavjud emas."
            });
        }

        try {
            const usage =
                await getGuestUsage(
                    req,
                    res
                );

            const usedSeconds =
                Math.min(
                    guestLimitSeconds(),
                    usage.usedSeconds
                );

            const remainingSeconds =
                Math.max(
                    0,
                    guestLimitSeconds() -
                    usedSeconds
                );

            return res.json({
                active:
                    remainingSeconds > 0,
                exhausted:
                    remainingSeconds <= 0,
                usedSeconds,
                remainingSeconds,
                limitSeconds:
                    guestLimitSeconds()
            });
        } catch (error) {
            console.error(
                "❌ Guest status xatosi:",
                error?.message
            );

            return res.status(500)
                .json({
                    active: false,
                    error:
                        "Guest holatini olishda xato."
                });
        }
    }
);

// ==============================================// GEMINI LIVE TOKEN
// ==============================================

async function getLiveAccess(
    req,
    res
) {
    const user =
        await getAuthenticatedUser(req);

    if (user) {
        const access =
            userAccess(user);

        if (access.mode === "blocked") {
            return {
                allowed: false,
                code: "blocked",
                status: 403,
                error:
                    "Hisobingiz bloklangan."
            };
        }

        if (!access.active) {
            return {
                allowed: false,
                code: "expired",
                status: 403,
                error:
                    "Trial yoki Premium muddati tugagan. Davom etish uchun Premium obuna qiling."
            };
        }

        return {
            allowed: true,
            mode: access.mode,
            plan: access.plan || null,
            until: access.until || null
        };
    }

    if (!pool) {
        return {
            allowed: false,
            code: "database_unavailable",
            status: 500,
            error:
                "PostgreSQL mavjud emas."
        };
    }

    const usage =
        await getGuestUsage(
            req,
            res
        );

    const limitSeconds =
        guestLimitSeconds();

    const remainingSeconds =
        Math.max(
            0,
            limitSeconds -
            usage.usedSeconds
        );

    if (!usage.activeStartedAt) {
        return {
            allowed: false,
            code: "guest_not_started",
            status: 403,
            error:
                "Guest sessiyasi boshlanmagan."
        };
    }

    if (
        remainingSeconds <= 0
    ) {
        return {
            allowed: false,
            code: "guest_exhausted",
            status: 403,
            error:
                "Guest vaqti tugagan. Iltimos, Login yoki Register qiling."
        };
    }

    return {
        allowed: true,
        mode: "guest",
        plan: null,
        until: null,
        remainingSeconds
    };
}

app.get(
    "/api/live-token",
    async (req, res) => {

        console.log("");
        console.log(
            "=========================================="
        );
        console.log(
            "🎫 GEMINI LIVE TOKEN REQUEST"
        );
        console.log(
            "=========================================="
        );

        try {

            const access =
                await getLiveAccess(
                    req,
                    res
                );

            if (!access.allowed) {
                console.log(
                    "🚫 LIVE ACCESS DENIED:",
                    access.code
                );

                return res.status(
                    access.status || 403
                ).json({
                    success: false,
                    code: access.code,
                    error: access.error
                });
            }

            console.log(
                "✅ LIVE ACCESS:",
                access.mode
            );

            if (!GEMINI_API_KEY) {

                return res.status(500)
                    .json({
                        error:
                            "GEMINI_API_KEY topilmadi."
                    });
            }

            if (!ai) {

                return res.status(500)
                    .json({
                        error:
                            "Gemini client mavjud emas."
                    });
            }

            console.log(
                "🎤 Model:",
                LIVE_MODEL
            );

            const expireTime =
                new Date(
                    Date.now() +
                    30 *
                    60 *
                    1000
                ).toISOString();

            const newSessionExpireTime =
                new Date(
                    Date.now() +
                    60 *
                    1000
                ).toISOString();

            const token =
                await ai.authTokens.create({

                    config: {

                        uses: 1,

                        expireTime,

                        newSessionExpireTime,

                        liveConnectConstraints: {

                            model:
                                LIVE_MODEL,

                            config: {

                                responseModalities:
                                    ["AUDIO"],

                                inputAudioTranscription:
                                    {},

                                outputAudioTranscription:
                                    {},

                                systemInstruction:
                                    TEACHER_INSTRUCTION,

                                sessionResumption:
                                    {}
                            }
                        }
                    }
                });

            console.log(
                "=========================================="
            );

            console.log(
                "✅ EPHEMERAL TOKEN YARATILDI"
            );

            console.log(
                "🎤 LIVE READY"
            );

            console.log(
                "=========================================="
            );

            const learner = await getAuthenticatedUser(req);
            const learnerMemory = learner?.id
                ? await getLearnerMemory(learner.id)
                : null;

            return res.json({

                success:
                    true,

                token:
                    token.name,

                model:
                    LIVE_MODEL,

                learner: {
                    fullName: learner?.fullName || "",
                    memory: learnerMemory
                        ? {
                            profile: learnerMemory.profile,
                            sessions: learnerMemory.sessions,
                            progress: learnerMemory.progress,
                            mistakes: learnerMemory.mistakes,
                            vocabulary: learnerMemory.vocabulary
                        }
                        : null
                },
                access: {
                    mode:
                        access.mode,
                    plan:
                        access.plan || null,
                    until:
                        access.until || null,
                    remainingSeconds:
                        access.remainingSeconds ?? null
                }
            });

        } catch (error) {

            console.error(
                "❌ GEMINI LIVE TOKEN XATOSI"
            );

            console.error(
                "Message:",
                error?.message
            );

            console.error(
                "Status:",
                error?.status
            );

            return res.status(500)
                .json({

                    success:
                        false,

                    error:
                        "Gemini Live token yaratilmadi.",

                    details:
                        error?.message ||
                        "Unknown error"
                });
        }
    }
);


// ==============================================
// SPEAKING EXAM — AUDIO UPLOAD
// ==============================================

app.post(
    "/api/speaking/upload",
    upload.single("audio"),
    async (req, res) => {
        try {
            const user = await getAuthenticatedUser(req);
            if (!user?.id) return res.status(401).json({ success: false, error: "Speaking Exam uchun Login qiling." });
            if (!ai || !GEMINI_API_KEY) return res.status(503).json({ success: false, error: "AI baholash xizmati hozir mavjud emas." });
            if (!req.file || !req.file.size) return res.status(400).json({ success: false, error: "Audio fayl yuborilmadi." });
            const allowed = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];
            const mimeType = String(req.file.mimetype || "").split(";")[0].toLowerCase();
            if (!allowed.includes(mimeType)) return res.status(400).json({ success: false, error: "Audio formati qo‘llab-quvvatlanmaydi." });
            const level = String(req.body?.level || "").toUpperCase();
            const question = String(req.body?.question || "").trim().slice(0, 1000);
            if (!["A1", "A2", "B1", "B2", "C1"].includes(level) || !question) return res.status(400).json({ success: false, error: "CEFR daraja yoki savol noto‘g‘ri." });
            const prompt = "Assess this English speaking audio at CEFR " + level + ". Question: " + question + ". Return only JSON with keys transcript, grammar, vocabulary, fluency, pronunciation, overall, feedback, strengths, improvements, correctedVersion. Scores must be integers 0-100 relative to the selected level. Do not judge accent identity. If silent or unintelligible, return zero scores and say a clear recording is needed. This is practice feedback, not official CEFR certification.";
            const result = await ai.models.generateContent({
                model: CHAT_MODEL,
                contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: req.file.buffer.toString("base64") } }] }],
                config: { responseMimeType: "application/json" }
            });
            const parsed = JSON.parse(String(result.text || "").trim());
            const score = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
            const evaluation = { transcript: String(parsed.transcript || ""), grammar: score(parsed.grammar), vocabulary: score(parsed.vocabulary), fluency: score(parsed.fluency), pronunciation: score(parsed.pronunciation), overall: score(parsed.overall), feedback: String(parsed.feedback || ""), strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0,4).map(String) : [], improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0,4).map(String) : [], correctedVersion: String(parsed.correctedVersion || "") };
            return res.json({ success: true, evaluated: true, level, evaluation });
        } catch (error) {
            console.error("Speaking AI assessment error:", error?.message || error);
            return res.status(502).json({ success: false, error: "Speaking javobini AI tahlil qila olmadi. Qayta urinib ko‘ring." });
        }
    }
);

// ==============================================
// SPEAKING EXAM — SAVE COMPLETED MOCK RESULT
// ==============================================
app.post("/api/speaking/results", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user?.id) return res.status(401).json({ success: false, error: "Natijani saqlash uchun tizimga kiring." });
        const body = req.body || {};
        const level = String(body.level || "").toUpperCase();
        const estimatedLevel = String(body.estimatedLevel || "").toUpperCase();
        const validLevels = ["A1", "A2", "B1", "B2", "C1"];
        if (!validLevels.includes(level) || !validLevels.includes(estimatedLevel)) {
            return res.status(400).json({ success: false, error: "CEFR darajasi noto‘g‘ri." });
        }
        const scoreKeys = ["grammar", "vocabulary", "fluency", "pronunciation", "overall"];
        const scores = {};
        for (const key of scoreKeys) {
            const value = Number(body.scores?.[key]);
            if (!Number.isFinite(value) || value < 0 || value > 100) {
                return res.status(400).json({ success: false, error: "Speaking score qiymati noto‘g‘ri." });
            }
            scores[key] = Math.round(value);
        }
        if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 12) {
            return res.status(400).json({ success: false, error: "Speaking javoblari topilmadi." });
        }
        const answers = body.answers.map((answer, index) => ({
            part: Math.max(1, Math.min(3, Number(answer?.part) || 1)),
            question: String(answer?.question || "").slice(0, 1000),
            transcript: String(answer?.transcript || "").slice(0, 5000),
            grammar: Math.max(0, Math.min(100, Math.round(Number(answer?.grammar) || 0))),
            vocabulary: Math.max(0, Math.min(100, Math.round(Number(answer?.vocabulary) || 0))),
            fluency: Math.max(0, Math.min(100, Math.round(Number(answer?.fluency) || 0))),
            pronunciation: Math.max(0, Math.min(100, Math.round(Number(answer?.pronunciation) || 0))),
            overall: Math.max(0, Math.min(100, Math.round(Number(answer?.overall) || 0))),
            feedback: String(answer?.feedback || "").slice(0, 2500),
            strengths: Array.isArray(answer?.strengths) ? answer.strengths.slice(0, 4).map(x => String(x).slice(0, 300)) : [],
            improvements: Array.isArray(answer?.improvements) ? answer.improvements.slice(0, 4).map(x => String(x).slice(0, 300)) : [],
            correctedVersion: String(answer?.correctedVersion || "").slice(0, 1500)
        }));
        const savedResult = {
            type: "cefr-speaking-mock",
            level,
            estimatedLevel,
            scores,
            answers,
            completedAt: new Date().toISOString()
        };
        const saved = await pool.query(
            "INSERT INTO speaking_results (user_id, result) VALUES ($1, $2::jsonb) RETURNING id, created_at",
            [user.id, JSON.stringify(savedResult)]
        );
        return res.status(201).json({
            success: true,
            saved: true,
            resultId: saved.rows[0].id,
            createdAt: saved.rows[0].created_at
        });
    } catch (error) {
        console.error("Speaking result save error:", error?.message || error);
        return res.status(500).json({ success: false, error: "Speaking natijasini saqlashda xatolik yuz berdi." });
    }
});


app.get("/api/speaking/results", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user?.id) return res.status(401).json({ success: false, error: "Speaking tarixini ko‘rish uchun tizimga kiring." });
        const result = await pool.query(
            "SELECT id, result, created_at FROM speaking_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
            [user.id]
        );
        return res.json({
            success: true,
            results: result.rows.map(row => ({
                id: row.id,
                result: row.result,
                createdAt: row.created_at
            }))
        });
    } catch (error) {
        console.error("Speaking result history error:", error?.message || error);
        return res.status(500).json({ success: false, error: "Speaking tarixini yuklashda xatolik." });
    }
});

// ==============================================
// NORMAL CHAT
// ==============================================

app.post(
    "/api/chat",
    async (req, res) => {
        try {
            if (!ai) {
                return res.status(500)
                    .json({
                        error:
                            "Gemini API sozlanmagan."
                    });
            }

            const message =
                String(
                    req.body?.message ||
                    ""
                ).trim();

            if (!message) {
                return res.status(400)
                    .json({
                        error:
                            "Xabar yuborilmadi."
                    });
            }

            const user =
                await getAuthenticatedUser(req);

            let memory = null;

            if (user?.id) {
                memory =
                    await getLearnerMemory(
                        user.id
                    );
            }

            const learnerName =
                user?.fullName ||
                "o‘quvchi";

            const memoryInstruction =
                buildLearnerMemoryInstruction(
                    memory
                );

            const currentTopic =
    memory?.profile?.current_topic || "";

const lastLessonSummary =
    memory?.profile?.last_lesson_summary || "";

const preferredLanguage =
    memory?.profile?.preferred_language || "";

const hasPreviousLesson =
    Boolean(preferredLanguage || currentTopic || lastLessonSummary);

const learnerContext = `
CURRENT LEARNER:

Ismi:
${learnerName}

Email:
${user?.email || "Mavjud emas"}

CEFR:
${memory?.profile?.cefr_level || "Hali aniqlanmagan"}

O'RGANILAYOTGAN TIL:
${preferredLanguage || "Hali tanlanmagan"}

FOYDALANUVCHI HOLATI:
${hasPreviousLesson ? "MAVJUD FOYDALANUVCHI — tanlangan tilni davom ettiring." : "YANGI FOYDALANUVCHI — tillar ro'yxatini ayting va bitta til tanlashini so'rang."}

JORIY MAVZU:
${currentTopic || "Hali aniqlanmagan"}

OXIRGI DARS XULOSASI:
${lastLessonSummary || "Hali mavjud emas"}

${memoryInstruction}

DAVOM ETTIRISH UCHUN YUQORI USTUVOR QOIDA:

Agar foydalanuvchi "davom etamiz", "davom etaylik",
"darsni davom ettiraylik", "continue" yoki shu mazmundagi
ibora bilan murojaat qilsa:

- Agar O'RGANILAYOTGAN TIL mavjud bo'lsa, faqat shu tilda darsni davom ettiring.
- JORIY MAVZU mavjud bo'lsa, aynan shu mavzuni davom ettiring.
- Yangi til tanlamang va "qaysi tilni davom ettiramiz?" yoki "qaysi mavzuda davom etamiz?" deb qayta so'ramang.
- Boshqa tilga o'tishni faqat foydalanuvchi o'zi aniq so'rasa bajaring.
- OXIRGI DARS XULOSASI asosida keyingi mantiqiy mashqni boshlang.
- Javob boshida oldingi mavzuni qisqa eslating.
- Masalan, JORIY MAVZU "Present Perfect" bo‘lsa,
  aynan Present Perfect bo‘yicha practice, speaking,
  correction yoki qisqa testni davom ettiring.
- Foydalanuvchi yangi mavzu so‘ramagan bo‘lsa, boshqa mavzuga o‘tmang.
`;

            const result =
                await generateGeminiWithRetry({
                    model:
                        CHAT_MODEL,

                    contents:
                        message,

                    config: {
                        systemInstruction:
                            TEACHER_INSTRUCTION +
                            "\n\n" +
                            learnerContext
                    }
                });

            const reply =
                result.text ||
                "Javob olinmadi.";

            if (user?.id) {
                const extractedMemory = await extractLearnerMemory(
                    user.id,
                    message,
                    reply,
                    memory
                );

                if (!extractedMemory) {
                    await updateLearnerMemoryFromChat(
                        user.id,
                        message,
                        reply,
                        memory
                    );
                }
            }

            return res.json({
                success:
                    true,
                reply
            });

        } catch (error) {

            console.error(
                "❌ CHAT XATOSI:",
                error
            );

            return res.status(500)
                .json({
                    success:
                        false,

                    error:
                        "Teacher Hasan bilan aloqa ishlamadi.",

                    details:
                        error?.message
                });
        }
    }
);


// ==============================================
// VOICE LEARNER MEMORY
// ==============================================
app.post(
    "/api/learner/voice-memory",
    async (req, res) => {
        try {
            const user = await getAuthenticatedUser(req);
            if (!user?.id) {
                return res.status(401).json({
                    success: false,
                    error: "O‘quv jarayonini saqlash uchun hisobingizga kiring."
                });
            }

            const message = String(req.body?.message || "").trim().slice(0, 12000);
            const reply = String(req.body?.reply || "").trim().slice(0, 12000);

            if (!message || !reply) {
                return res.status(400).json({
                    success: false,
                    error: "Suhbat matni to‘liq yuborilmadi."
                });
            }

            const memory = await getLearnerMemory(user.id);
            let saved = await extractLearnerMemory(
                user.id,
                message,
                reply,
                memory
            );

            if (!saved) {
                saved = await updateLearnerMemoryFromChat(
                    user.id,
                    message,
                    reply,
                    memory
                );
            }

            return res.json({
                success: true,
                saved: Boolean(saved)
            });
        } catch (error) {
            console.error("VOICE MEMORY ERROR:", error?.message || error);
            return res.status(500).json({
                success: false,
                error: "O‘quv xotirasini saqlashda xatolik."
            });
        }
    }
);


// ==============================================
 // ADMIN OTP AUTHENTICATION
 // ==============================================

const ADMIN_OTP_TTL_SECONDS = Math.max(60, Math.min(600, Number(process.env.ADMIN_OTP_TTL_SECONDS || 300)));
const ADMIN_OTP_MAX_ATTEMPTS = Math.max(1, Math.min(10, Number(process.env.ADMIN_OTP_MAX_ATTEMPTS || 5)));
const ADMIN_OTP_RESEND_COOLDOWN_SECONDS = Math.max(30, Math.min(300, Number(process.env.ADMIN_OTP_RESEND_COOLDOWN_SECONDS || 60)));
const ADMIN_SESSION_TTL_SECONDS = Math.max(900, Math.min(28800, Number(process.env.ADMIN_SESSION_TTL_SECONDS || 28800)));
const ADMIN_LOGIN_RATE_LIMIT = Math.max(3, Math.min(20, Number(process.env.ADMIN_LOGIN_RATE_LIMIT || 10)));

function adminCookieOptions() {
    return {
        secure: process.env.NODE_ENV !== "development" ||
            String(process.env.ADMIN_COOKIE_SECURE || "").toLowerCase() === "true"
    };
}
function setAdminSessionCookie(res, token) {
    res.setHeader("Set-Cookie", buildAdminSessionCookie(token, {
        ...adminCookieOptions(), maxAgeSeconds: ADMIN_SESSION_TTL_SECONDS
    }));
}
function clearAdminCookie(res) {
    res.setHeader("Set-Cookie", clearAdminSessionCookie(adminCookieOptions()));
}
function adminAuthReady() {
    return Boolean(pool && normalizeEmail(process.env.ADMIN_EMAIL) &&
        process.env.ADMIN_PASSWORD_HASH &&
        String(process.env.ADMIN_OTP_PEPPER || "").length >= 32 &&
        mailTransporter);
}
function adminOtpHash(challengeId, otp) {
    return hashOtp(challengeId, otp, process.env.ADMIN_OTP_PEPPER);
}
function adminRateLimitKey(scope, req, identity = "") {
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    return crypto.createHash("sha256").update(`${scope}:${ip}:${identity}`).digest("hex");
}
let lastAdminAuthCleanupAt = 0;

async function cleanupAdminAuthRecords() {
    if (Date.now() - lastAdminAuthCleanupAt < 60 * 60 * 1000) return;
    lastAdminAuthCleanupAt = Date.now();

    try {
        await pool.query("DELETE FROM admin_auth_rate_limits WHERE window_started_at < NOW() - INTERVAL '2 days'");
        await pool.query("DELETE FROM admin_otp_challenges WHERE expires_at < NOW() - INTERVAL '2 days'");
        await pool.query(`DELETE FROM admin_sessions
            WHERE expires_at < NOW() - INTERVAL '30 days'
               OR revoked_at < NOW() - INTERVAL '30 days'`);
    } catch (error) {
        console.warn("ADMIN auth cleanup skipped:", error?.code || "DB_ERROR");
    }
}

async function consumeAdminRateLimit(bucketKey, maxAttempts, windowSeconds) {
    await cleanupAdminAuthRecords();
    const result = await pool.query(
        `INSERT INTO admin_auth_rate_limits (bucket_key, window_started_at, attempts)
         VALUES ($1, NOW(), 1)
         ON CONFLICT (bucket_key) DO UPDATE SET
           attempts = CASE WHEN admin_auth_rate_limits.window_started_at <= NOW() - ($2 * INTERVAL '1 second')
             THEN 1 ELSE admin_auth_rate_limits.attempts + 1 END,
           window_started_at = CASE WHEN admin_auth_rate_limits.window_started_at <= NOW() - ($2 * INTERVAL '1 second')
             THEN NOW() ELSE admin_auth_rate_limits.window_started_at END
         RETURNING attempts`,
        [bucketKey, windowSeconds]
    );
    return Number(result.rows[0]?.attempts || 0) <= maxAttempts;
}
async function sendAdminOtpEmail(email, otp) {
    if (!mailTransporter) throw new Error("SMTP_NOT_CONFIGURED");
    await mailTransporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: "Teacher Hasan — admin tasdiqlash kodi",
        text: `Teacher Hasan admin paneliga kirish kodingiz: ${otp}\n\nKod ${Math.floor(ADMIN_OTP_TTL_SECONDS / 60)} daqiqa amal qiladi. Uni hech kimga bermang.\n\nAgar bu so‘rovni siz yubormagan bo‘lsangiz, xabarni e’tiborsiz qoldiring.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172033"><h2>Teacher Hasan — Admin</h2><p>Admin paneliga kirish uchun tasdiqlash kodingiz:</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px 20px;background:#f2f4fa;border-radius:12px;text-align:center">${otp}</div><p>Ushbu kod <b>${Math.floor(ADMIN_OTP_TTL_SECONDS / 60)} daqiqa</b> amal qiladi.</p><p style="color:#68738a;font-size:13px">Kodni hech kimga bermang. Agar bu siz bo‘lmasangiz, xabarni e’tiborsiz qoldiring.</p></div>`
    });
}
function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
function sendAdminAuthUnavailable(res) {
    return res.status(503).json({ success: false, error: "Admin autentifikatsiyasi hozircha sozlanmagan." });
}

// Stage 1: password verification only. No authenticated session is created here.
app.post("/api/admin/auth/login", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!adminAuthReady()) return sendAdminAuthUnavailable(res);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || email.length > 320 || !password || password.length > 1024) {
        return res.status(400).json({ success: false, error: "Email va parolni kiriting." });
    }
    try {
        const allowed = await consumeAdminRateLimit(adminRateLimitKey("login", req, email), ADMIN_LOGIN_RATE_LIMIT, 900);
        if (!allowed) return res.status(429).json({ success: false, error: "Kirish urinishlari ko‘paydi. 15 daqiqadan keyin qayta urinib ko‘ring." });

        const configuredEmail = normalizeEmail(process.env.ADMIN_EMAIL);
        const passwordValid = await verifyAdminPassword(password, process.env.ADMIN_PASSWORD_HASH).catch(() => false);
        if (email !== configuredEmail || !passwordValid) {
            return res.status(401).json({ success: false, error: "Email yoki parol noto‘g‘ri." });
        }

        const challengeId = crypto.randomUUID();
        const otp = generateOtp();
        await pool.query(
            "UPDATE admin_otp_challenges SET consumed_at = COALESCE(consumed_at, NOW()) WHERE admin_email = $1 AND consumed_at IS NULL",
            [configuredEmail]
        );
        await pool.query(
            `INSERT INTO admin_otp_challenges (id, admin_email, otp_hash, expires_at, attempts, last_sent_at)
             VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'), 0, NOW())`,
            [challengeId, configuredEmail, adminOtpHash(challengeId, otp), ADMIN_OTP_TTL_SECONDS]
        );
        try {
            await sendAdminOtpEmail(configuredEmail, otp);
        } catch (mailError) {
            await pool.query("UPDATE admin_otp_challenges SET consumed_at = NOW() WHERE id = $1", [challengeId]);
            console.error("ADMIN OTP email delivery failed:", mailError?.code || "SMTP_ERROR");
            return res.status(503).json({ success: false, error: "Tasdiqlash xatini yuborib bo‘lmadi. Keyinroq qayta urinib ko‘ring." });
        }
        return res.json({
            success: true, challengeId,
            expiresInSeconds: ADMIN_OTP_TTL_SECONDS,
            resendAfterSeconds: ADMIN_OTP_RESEND_COOLDOWN_SECONDS,
            message: "Tasdiqlash kodi admin emailingizga yuborildi."
        });
    } catch (error) {
        console.error("ADMIN OTP login error:", error?.code || "AUTH_ERROR");
        return res.status(503).json({ success: false, error: "Kirish so‘rovini bajarib bo‘lmadi. Keyinroq qayta urinib ko‘ring." });
    }
});

// Stage 2: lock the challenge row to make attempt counting and one-time use atomic.
app.post("/api/admin/auth/verify-otp", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!adminAuthReady()) return sendAdminAuthUnavailable(res);
    const challengeId = String(req.body?.challengeId || "");
    const otp = String(req.body?.otp || "").trim();
    if (!isValidUuid(challengeId) || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({ success: false, error: "Tasdiqlash kodini to‘g‘ri kiriting." });
    }

    let client;
    try {
        const allowed = await consumeAdminRateLimit(adminRateLimitKey("verify", req, challengeId), ADMIN_OTP_MAX_ATTEMPTS + 2, 900);
        if (!allowed) return res.status(429).json({ success: false, error: "Tasdiqlash urinishlari vaqtincha cheklangan." });

        client = await pool.connect();
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT id, admin_email, otp_hash, expires_at, attempts, consumed_at FROM admin_otp_challenges WHERE id = $1 FOR UPDATE",
            [challengeId]
        );
        const challenge = result.rows[0];
        if (!challenge || challenge.consumed_at ||
            new Date(challenge.expires_at).getTime() <= Date.now() ||
            Number(challenge.attempts) >= ADMIN_OTP_MAX_ATTEMPTS) {
            await client.query("ROLLBACK");
            return res.status(401).json({ success: false, error: "Kod noto‘g‘ri yoki uning amal qilish muddati tugagan." });
        }

        if (!safeEqualHex(challenge.otp_hash, adminOtpHash(challengeId, otp))) {
            await client.query(
                `UPDATE admin_otp_challenges SET attempts = attempts + 1,
                 consumed_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE consumed_at END
                 WHERE id = $1`,
                [challengeId, ADMIN_OTP_MAX_ATTEMPTS]
            );
            await client.query("COMMIT");
            return res.status(401).json({ success: false, error: "Kod noto‘g‘ri yoki uning amal qilish muddati tugagan." });
        }

        const token = generateToken();
        const session = await client.query(
            `INSERT INTO admin_sessions (admin_email, token_hash, expires_at)
             VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second')) RETURNING id, expires_at`,
            [challenge.admin_email, hashSessionToken(token), ADMIN_SESSION_TTL_SECONDS]
        );
        await client.query("UPDATE admin_otp_challenges SET consumed_at = NOW() WHERE id = $1", [challengeId]);
        await client.query("COMMIT");
        setAdminSessionCookie(res, token);
        return res.json({ success: true, admin: { email: challenge.admin_email }, expiresAt: session.rows[0].expires_at });
    } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("ADMIN OTP verification error:", error?.code || "AUTH_ERROR");
        return res.status(503).json({ success: false, error: "Tasdiqlashni bajarib bo‘lmadi. Qayta urinib ko‘ring." });
    } finally {
        client?.release();
    }
});

// A resend rotates the stored OTP hash; the previous code stops working immediately.
app.post("/api/admin/auth/resend-otp", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!adminAuthReady()) return sendAdminAuthUnavailable(res);
    const challengeId = String(req.body?.challengeId || "");
    if (!isValidUuid(challengeId)) return res.status(400).json({ success: false, error: "Tasdiqlash so‘rovi yaroqsiz." });

    try {
        const allowed = await consumeAdminRateLimit(adminRateLimitKey("resend", req, challengeId), 10, 3600);
        if (!allowed) return res.status(429).json({ success: false, error: "Kod yuborish so‘rovlari vaqtincha cheklangan." });

        const otp = generateOtp();
        const result = await pool.query(
            `UPDATE admin_otp_challenges
             SET otp_hash = $2, expires_at = NOW() + ($3 * INTERVAL '1 second'),
                 attempts = 0, last_sent_at = NOW()
             WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW()
               AND attempts < $4
               AND COALESCE(last_sent_at, '-infinity'::timestamptz) <= NOW() - ($5 * INTERVAL '1 second')
             RETURNING admin_email`,
            [challengeId, adminOtpHash(challengeId, otp), ADMIN_OTP_TTL_SECONDS, ADMIN_OTP_MAX_ATTEMPTS, ADMIN_OTP_RESEND_COOLDOWN_SECONDS]
        );
        const challenge = result.rows[0];
        if (!challenge) return res.status(429).json({ success: false, error: "Kodni qayta yuborish hozircha mumkin emas. Biroz kuting yoki qayta kiring." });

        try {
            await sendAdminOtpEmail(challenge.admin_email, otp);
        } catch (mailError) {
            await pool.query("UPDATE admin_otp_challenges SET consumed_at = NOW() WHERE id = $1", [challengeId]);
            console.error("ADMIN OTP resend failed:", mailError?.code || "SMTP_ERROR");
            return res.status(503).json({ success: false, error: "Yangi kodni yuborib bo‘lmadi. Qayta kirishni boshlang." });
        }
        return res.json({
            success: true, expiresInSeconds: ADMIN_OTP_TTL_SECONDS,
            resendAfterSeconds: ADMIN_OTP_RESEND_COOLDOWN_SECONDS,
            message: "Yangi tasdiqlash kodi yuborildi."
        });
    } catch (error) {
        console.error("ADMIN OTP resend error:", error?.code || "AUTH_ERROR");
        return res.status(503).json({ success: false, error: "Kodni yuborib bo‘lmadi. Keyinroq qayta urinib ko‘ring." });
    }
});

async function requireAdmin(req, res, next) {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        let sameOrigin = false;
        try {
            const origin = req.get("origin");
            const originUrl = origin ? new URL(origin) : null;
            const forwardedProto = String(req.get("x-forwarded-proto") || req.protocol)
                .split(",")[0].trim().toLowerCase();
            const expectedProtocol = forwardedProto.endsWith(":")
                ? forwardedProto
                : `${forwardedProto}:`;
            sameOrigin = Boolean(
                originUrl &&
                originUrl.host.toLowerCase() === String(req.get("host") || "").toLowerCase() &&
                originUrl.protocol === expectedProtocol
            );
        } catch { sameOrigin = false; }
        if (!sameOrigin) return res.status(403).json({ success: false, error: "So‘rov manbasi tasdiqlanmadi." });
    }

    const token = readCookie(req.headers.cookie, "th_admin_session");
    if (!token) {
        clearAdminCookie(res);
        return res.status(401).json({ success: false, error: "Admin sessiyasi mavjud emas." });
    }
    if (!pool) return sendAdminAuthUnavailable(res);

    try {
        const result = await pool.query(
            `SELECT id, admin_email, expires_at FROM admin_sessions
             WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
            [hashSessionToken(token)]
        );
        const session = result.rows[0];
        if (!session) {
            clearAdminCookie(res);
            return res.status(401).json({ success: false, error: "Admin sessiyasi tugagan." });
        }
        req.adminSessionId = session.id;
        req.adminEmail = session.admin_email;
        req.adminExpiresAt = session.expires_at;
        return next();
    } catch (error) {
        console.error("ADMIN session lookup failed:", error?.code || "DB_ERROR");
        return res.status(503).json({ success: false, error: "Admin sessiyasini tekshirib bo‘lmadi." });
    }
}

app.get("/api/admin/auth/me", requireAdmin, (req, res) => {
    return res.json({ success: true, admin: { email: req.adminEmail }, expiresAt: req.adminExpiresAt });
});
app.post("/api/admin/auth/logout", requireAdmin, async (req, res) => {
    try {
        await pool.query("UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL", [req.adminSessionId]);
        clearAdminCookie(res);
        return res.json({ success: true });
    } catch (error) {
        console.error("ADMIN logout failed:", error?.code || "DB_ERROR");
        return res.status(503).json({ success: false, error: "Sessiyani yakunlab bo‘lmadi. Qayta urinib ko‘ring." });
    }
});

// Retire the former one-step username/password endpoint: it can never issue a session.
app.post("/api/admin/login", (req, res) => {
    return res.status(410).json({
        success: false,
        error: "Eski admin login o‘chirilgan. Email, parol va OTP orqali kiring."
    });
});

// ==============================================// ADMIN DASHBOARD
// ==============================================
// ==============================================
// ADMIN DASHBOARD
// ==============================================

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    async (req, res) => {
        try {
            const [
                usersResult,
                paymentsResult,
                speakingResultsResult
            ] = await Promise.all([
                pool.query(`
                    SELECT
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    FROM users
                    ORDER BY created_at ASC
                `),
                pool.query(`
                    SELECT
                        id,
                        invoice_id,
                        multicard_uuid,
                        user_id,
                        user_name,
                        plan,
                        months,
                        amount,
                        payment_method,
                        status,
                        legal_consent,
                        multicard_status,
                        created_at,
                        paid_at
                    FROM payments
                    ORDER BY created_at ASC
                `),
                pool.query(`
                    SELECT
                        id,
                        user_id,
                        result,
                        created_at
                    FROM speaking_results
                    ORDER BY created_at ASC
                `)
            ]);

            const users = usersResult.rows.map(row => ({
                id: row.id,
                fullName: row.full_name,
                email: row.email,
                phone: row.phone,
                blocked: row.blocked,
                subscriptionStatus: row.subscription_status,
                plan: row.plan,
                createdAt: row.created_at,
                trialUntil: row.trial_until,
                expiresAt: row.expires_at,
                speakingCount: row.speaking_count,
                legalConsent: row.legal_consent || {}
            }));

            const payments = paymentsResult.rows.map(row => ({
                id: row.id,
                invoiceId: row.invoice_id,
                multicardUuid: row.multicard_uuid,
                userId: row.user_id,
                userName: row.user_name,
                plan: row.plan,
                months: row.months,
                amount: row.amount,
                paymentMethod: row.payment_method,
                status: row.status,
                legalConsent: row.legal_consent || {},
                multicardStatus: row.multicard_status,
                createdAt: row.created_at,
                paidAt: row.paid_at
            }));

            const speakingResults =
                speakingResultsResult.rows.map(row => ({
                    id: row.id,
                    userId: row.user_id,
                    result: row.result,
                    createdAt: row.created_at
                }));

            let premium = 0;
            let trial = 0;
            let blocked = 0;

            users.forEach(user => {
                if (user.blocked) {
                    blocked++;
                    return;
                }

                const access = userAccess(user);

                if (access.mode === "premium") {
                    premium++;
                }

                if (access.mode === "trial") {
                    trial++;
                }
            });

            const successfulPayments =
                payments.filter(
                    payment => payment.status === "success"
                );

            const revenue =
                successfulPayments.reduce(
                    (total, payment) =>
                        total + Number(payment.amount || 0),
                    0
                );

            return res.json({
                success: true,
                stats: {
                    users: users.length,
                    premium,
                    trial,
                    blocked,
                    payments: successfulPayments.length,
                    revenue,
                    speakingResults: speakingResults.length,
                    serverTime: new Date().toISOString()
                },
                recentUsers:
                    users
                        .slice(-10)
                        .reverse(),
                recentPayments:
                    payments
                        .slice(-10)
                        .reverse()
            });
        } catch (error) {
            console.error(
                "❌ Admin dashboard error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Dashboard ma'lumotlarini olishda xatolik."
            });
        }
    }
);


// ==============================================
// ADMIN USERS
// ==============================================

app.get(

    "/api/admin/users",

    requireAdmin,

    async (req, res) => {

        try {

            const result =
                await pool.query(`
                    SELECT
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    FROM users
                    ORDER BY created_at ASC
                `);

            const users =
                result.rows.map(row => ({

                    id: row.id,
                    fullName: row.full_name,
                    email: row.email,
                    phone: row.phone,
                    blocked: row.blocked,
                    subscriptionStatus:
                        row.subscription_status,
                    plan: row.plan,
                    createdAt: row.created_at,
                    trialUntil: row.trial_until,
                    expiresAt: row.expires_at,
                    speakingCount:
                        row.speaking_count,
                    legalConsent:
                        row.legal_consent || {}

                }));

            return res.json({
                success: true,
                users
            });

        } catch (error) {

            console.error(
                "❌ Admin users error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Foydalanuvchilarni olishda xatolik."
            });

        }

    }

);


// ==============================================// ADMIN UPDATE USER
// ==============================================
app.patch(

    "/api/admin/users/:id",

    requireAdmin,

    async (req, res) => {

        try {

            const updates = [];
            const values = [];

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    "blocked"
                )
            ) {
                values.push(
                    Boolean(req.body.blocked)
                );

                updates.push(
                    `blocked = $${values.length}`
                );
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    "subscriptionStatus"
                )
            ) {
                values.push(
                    req.body.subscriptionStatus
                );

                updates.push(
                    `subscription_status = $${values.length}`
                );
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    "plan"
                )
            ) {
                values.push(
                    req.body.plan
                );

                updates.push(
                    `plan = $${values.length}`
                );
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    "expiresAt"
                )
            ) {
                values.push(
                    req.body.expiresAt || null
                );

                updates.push(
                    `expires_at = $${values.length}`
                );
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    "trialUntil"
                )
            ) {
                values.push(
                    req.body.trialUntil || null
                );

                updates.push(
                    `trial_until = $${values.length}`
                );
            }

            if (updates.length === 0) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Yangilanadigan maydon topilmadi."

                });

            }

            values.push(req.params.id);

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET ${updates.join(", ")}
                    WHERE id = $${values.length}
                    RETURNING
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    `,
                    values
                );

            const row =
                result.rows[0];

            if (!row) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Foydalanuvchi topilmadi."

                });

            }

            const user = {

                id:
                    row.id,

                fullName:
                    row.full_name,

                email:
                    row.email,

                phone:
                    row.phone,

                blocked:
                    row.blocked,

                subscriptionStatus:
                    row.subscription_status,

                plan:
                    row.plan,

                createdAt:
                    row.created_at,

                trialUntil:
                    row.trial_until,

                expiresAt:
                    row.expires_at,

                speakingCount:
                    row.speaking_count,

                legalConsent:
                    row.legal_consent || {}

            };

            return res.json({

                success: true,

                user

            });

        } catch (error) {

            console.error(
                "❌ Admin update user error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Foydalanuvchini yangilashda xatolik."

            });

        }

    }

);


app.get(

    "/api/admin/payments",

    requireAdmin,

    async (req, res) => {

        try {

            const result =
                await pool.query(`
                    SELECT
                        id,
                        invoice_id,
                        multicard_uuid,
                        user_id,
                        user_name,
                        plan,
                        months,
                        amount,
                        payment_method,
                        status,
                        legal_consent,
                        multicard_status,
                        created_at,
                        paid_at
                    FROM payments
                    ORDER BY created_at ASC
                `);

            const payments =
                result.rows.map(row => ({

                    id:
                        row.id,

                    invoiceId:
                        row.invoice_id,

                    multicardUuid:
                        row.multicard_uuid,

                    userId:
                        row.user_id,

                    userName:
                        row.user_name,

                    plan:
                        row.plan,

                    months:
                        row.months,

                    amount:
                        row.amount,

                    paymentMethod:
                        row.payment_method,

                    status:
                        row.status,

                    legalConsent:
                        row.legal_consent || {},

                    multicardStatus:
                        row.multicard_status,

                    createdAt:
                        row.created_at,

                    paidAt:
                        row.paid_at

                }));

            return res.json({

                success: true,

                payments

            });

        } catch (error) {

            console.error(
                "❌ Admin payments error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "To'lovlarni olishda xatolik."

            });

        }

    }

);


app.get(

    "/api/admin/speaking-results",

    requireAdmin,

    async (req, res) => {

        try {

            const result =
                await pool.query(`
                    SELECT
                        id,
                        user_id,
                        result,
                        created_at
                    FROM speaking_results
                    ORDER BY created_at ASC
                `);

            const results =
                result.rows.map(row => ({

                    id:
                        row.id,

                    userId:
                        row.user_id,

                    result:
                        row.result || {},

                    createdAt:
                        row.created_at

                }));

            return res.json({

                success: true,

                results

            });

        } catch (error) {

            console.error(
                "❌ Admin speaking results error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Speaking natijalarini olishda xatolik."

            });

        }

    }

);


app.get(
    "/api/admin/settings",
    requireAdmin,
    (req, res) => {

        res.json({

            success:
                true,

            settings: {

                guestMinutes:
                    GUEST_MINUTES,

                trialDays:
                    TRIAL_DAYS,

                plans: {

                    oneMonth:
                        PLAN_1_MONTH,

                    twoMonths:
                        PLAN_2_MONTHS,

                    threeMonths:
                        PLAN_3_MONTHS
                }
            }
        });
    }
);


// ==============================================// ADMIN USER PREMIUM MANUAL ACTIVATION
// ==============================================
app.post(

    "/api/admin/users/:id/premium",

    requireAdmin,

    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const months =
                Number(req.body?.months || 1);

            const safeMonths =
                [1, 2, 3].includes(months)
                    ? months
                    : 1;

            const amount =
                safeMonths === 1
                    ? PLAN_1_MONTH
                    : safeMonths === 2
                        ? PLAN_2_MONTHS
                        : PLAN_3_MONTHS;

            const plan =
                `${safeMonths} oy`;

            await client.query(
                "BEGIN"
            );

            const userResult =
                await client.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    FROM users
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [req.params.id]
                );

            const row =
                userResult.rows[0];

            if (!row) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({

                    success: false,

                    error:
                        "Foydalanuvchi topilmadi."

                });

            }

            const now =
                new Date();

            const currentExpiry =
                row.expires_at
                    ? new Date(row.expires_at)
                    : now;

            const startDate =
                currentExpiry > now
                    ? currentExpiry
                    : now;

            const expires =
                new Date(
                    startDate.getTime() +
                    safeMonths *
                    30 *
                    24 *
                    60 *
                    60 *
                    1000
                );

            const updatedUserResult =
                await client.query(
                    `
                    UPDATE users
                    SET
                        subscription_status = 'premium',
                        plan = $1,
                        expires_at = $2,
                        blocked = FALSE
                    WHERE id = $3
                    RETURNING
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    `,
                    [
                        plan,
                        expires,
                        req.params.id
                    ]
                );

            const updatedRow =
                updatedUserResult.rows[0];

            const paymentId =
                crypto.randomUUID();

            await client.query(
                `
                INSERT INTO payments (
                    id,
                    user_id,
                    user_name,
                    plan,
                    months,
                    amount,
                    payment_method,
                    status,
                    legal_consent,
                    created_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    0,
                    'admin_grant',
                    'admin_grant',
                    '{}'::jsonb,
                    $6
                )
                `,
                [
                    paymentId,
                    updatedRow.id,
                    updatedRow.full_name,
                    plan,
                    safeMonths,
                    now
                ]
            );

            await client.query(
                "COMMIT"
            );

            const user = {

                id:
                    updatedRow.id,

                fullName:
                    updatedRow.full_name,

                email:
                    updatedRow.email,

                phone:
                    updatedRow.phone,

                blocked:
                    updatedRow.blocked,

                subscriptionStatus:
                    updatedRow.subscription_status,

                plan:
                    updatedRow.plan,

                createdAt:
                    updatedRow.created_at,

                trialUntil:
                    updatedRow.trial_until,

                expiresAt:
                    updatedRow.expires_at,

                speakingCount:
                    updatedRow.speaking_count,

                legalConsent:
                    updatedRow.legal_consent || {}

            };

            return res.json({

                success: true,

                user

            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch (rollbackError) {

                console.error(
                    "❌ Admin premium rollback error:",
                    rollbackError
                );

            }

            console.error(
                "❌ Admin premium error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Premium berishda xatolik."

            });

        } finally {

            client.release();

        }

    }

);


app.post(

    "/api/payment/create",

    async (req, res) => {

        try {

            const user =
                await getAuthenticatedUser(req);

            if (!user) {

                return res.status(401).json({

                    success: false,

                    error:
                        "Avval tizimga kiring."

                });

            }

            const months =
                Number(req.body?.months || 1);

            const safeMonths =
                [1, 2, 3].includes(months)
                    ? months
                    : 1;

            const amount =
                safeMonths === 1
                    ? PLAN_1_MONTH
                    : safeMonths === 2
                        ? PLAN_2_MONTHS
                        : PLAN_3_MONTHS;

            const plan =
                `${safeMonths} oy`;

            const invoiceId =
                `TH-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

            const multicard =
                await createMulticardInvoice({

                    invoiceId,

                    amount

                });

            const paymentId =
                crypto.randomUUID();

            const legalConsent = {

                accepted: true,

                acceptedAt:
                    new Date().toISOString(),

                privacyPolicyVersion:
                    PRIVACY_POLICY_VERSION,

                offerVersion:
                    OFFER_VERSION

            };

            await pool.query(
                `
                INSERT INTO payments (
                    id,
                    invoice_id,
                    multicard_uuid,
                    user_id,
                    user_name,
                    plan,
                    months,
                    amount,
                    payment_method,
                    status,
                    legal_consent,
                    created_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    'multicard',
                    'pending',
                    $9,
                    $10
                )
                `,
                [
                    paymentId,
                    invoiceId,
                    multicard.uuid,
                    user.id,
                    user.fullName,
                    plan,
                    safeMonths,
                    amount,
                    legalConsent,
                    new Date()
                ]
            );

            return res.json({

                success: true,

                invoiceId,

                paymentId,

                multicardUuid:
                    multicard.uuid,

                amount,

                plan,

                months:
                    safeMonths,

                status:
                    "pending",

                checkoutUrl:
                    multicard.checkout_url

            });

        } catch (error) {

            console.error(
                "❌ Payment create error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "To'lov yaratishda xatolik."

            });

        }

    }

);


app.post(

    "/api/payment/webhook",

    async (req, res) => {

        let client = null;

        try {

            const body =
                req.body || {};

            console.log(
                "MULTICARD WEBHOOK:",
                body
            );

            // 1. Multicard signature tekshirish

            if (
                !verifyMulticardSignature(
                    body
                )
            ) {

                console.error(
                    "MULTICARD SIGN INVALID"
                );

                return res.status(403)
                    .json({

                        success: false,

                        error:
                            "Invalid signature"

                    });

            }

            // 2. Ma'lumotlarni olish

            const invoiceId =
                String(
                    body.invoice_id ||
                    ""
                );

            const uuid =
                String(
                    body.uuid ||
                    ""
                );

            const status =
                String(
                    body.status ||
                    ""
                ).toLowerCase();

            const amount =
                Number(
                    body.amount || 0
                );

            // 3. Invoice tekshirish

            if (!invoiceId || !uuid) {

                return res.status(400)
                    .json({

                        success: false,

                        error:
                            "invoice_id yoki uuid yo‘q."

                    });

            }

            // 4. PostgreSQL transaction

            client =
                await pool.connect();

            await client.query(
                "BEGIN"
            );

            // Payment row'ni lock qilamiz.
            // Duplicate webhook race conditionini
            // oldini oladi.

            const paymentResult =
                await client.query(
                    `
                    SELECT
                        id,
                        invoice_id,
                        multicard_uuid,
                        user_id,
                        user_name,
                        plan,
                        months,
                        amount,
                        status,
                        multicard_status,
                        created_at,
                        paid_at
                    FROM payments
                    WHERE invoice_id = $1
                      AND multicard_uuid = $2
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        invoiceId,
                        uuid
                    ]
                );

            const payment =
                paymentResult.rows[0];

            if (!payment) {

                await client.query(
                    "ROLLBACK"
                );

                console.error(
                    "Payment topilmadi:",
                    invoiceId,
                    uuid
                );

                return res.status(404)
                    .json({

                        success: false,

                        error:
                            "Payment topilmadi."

                    });

            }

            // 5. Amount tekshirish

            const expectedAmount =
                Math.round(
                    Number(payment.amount) * 100
                );

            if (
                amount !==
                expectedAmount
            ) {

                await client.query(
                    "ROLLBACK"
                );

                console.error(
                    "Multicard amount mismatch:",
                    {
                        received:
                            amount,

                        expected:
                            expectedAmount,

                        paymentAmount:
                            payment.amount
                    }
                );

                return res.status(400)
                    .json({

                        success: false,

                        error:
                            "Amount mismatch."

                    });

            }

            // 6. Allaqachon success bo'lsa,
            // premiumni qayta uzaytirmaymiz.

            if (
                payment.status ===
                "success"
            ) {

                await client.query(
                    "COMMIT"
                );

                return res.status(200)
                    .json({

                        success: true

                    });

            }

            // 7. Userni transaction ichida lock qilamiz

            const userResult =
                await client.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        phone,
                        blocked,
                        subscription_status,
                        plan,
                        created_at,
                        trial_until,
                        expires_at,
                        speaking_count,
                        legal_consent
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        payment.user_id
                    ]
                );

            const user =
                userResult.rows[0];

            if (!user) {

                await client.query(
                    "ROLLBACK"
                );

                console.error(
                    "User topilmadi:",
                    payment.user_id
                );

                return res.status(404)
                    .json({

                        success: false,

                        error:
                            "User topilmadi."

                    });

            }

            // 8. Premium muddatini hisoblash

            const months =
                [1, 2, 3].includes(
                    Number(payment.months)
                )
                    ? Number(payment.months)
                    : 1;

            const now =
                new Date();

            const oldExpiry =
                user.expires_at
                    ? new Date(
                        user.expires_at
                    )
                    : now;

            const startDate =
                oldExpiry > now
                    ? oldExpiry
                    : now;

            const expires =
                new Date(
                    startDate.getTime() +
                    months *
                    30 *
                    24 *
                    60 *
                    60 *
                    1000
                );

            // 9. Userni premium qilish

            await client.query(
                `
                UPDATE users
                SET
                    subscription_status = 'premium',
                    plan = $1,
                    expires_at = $2,
                    blocked = FALSE
                WHERE id = $3
                `,
                [
                    payment.plan,
                    expires,
                    payment.user_id
                ]
            );

            // 10. Paymentni success qilish

            await client.query(
                `
                UPDATE payments
                SET
                    status = 'success',
                    multicard_status = 'success',
                    paid_at = NOW()
                WHERE id = $1
                `,
                [
                    payment.id
                ]
            );

            // 11. User + payment bir transactionda commit

            await client.query(
                "COMMIT"
            );

            console.log(
                "✅ MULTICARD PAYMENT SUCCESS:",
                invoiceId,
                user.full_name
            );

            return res.status(200)
                .json({

                    success: true

                });

        } catch (error) {

            if (client) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

                } catch (rollbackError) {

                    console.error(
                        "Webhook rollback error:",
                        rollbackError
                    );

                }

            }

            console.error(
                "WEBHOOK ERROR:",
                error
            );

            return res.status(500)
                .json({

                    success: false,

                    error:
                        "Webhook xatosi."

                });

        } finally {

            if (client) {

                client.release();

            }

        }

    }

);


app.use(
    (req, res) => {

        res.status(404)
            .json({

                error:
                    "Endpoint topilmadi.",

                path:
                    req.path
            });
    }
);


// ==============================================// START
// ==============================================
app.listen(
    PORT,
    () => {

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
            `👤 Trial: ${TRIAL_DAYS} kun`
        );

        console.log(
            `⏱️ Guest: ${GUEST_MINUTES} daqiqa`
        );

        console.log(
            "👨‍💼 Admin: ON"
        );

        console.log(
            "=========================================="
        );

        console.log("");
    }
);
