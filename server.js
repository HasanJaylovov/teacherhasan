import express from "express";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import pg from "pg";

const { Pool } = pg;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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

const CHAT_MODEL =
    "gemini-2.5-flash";

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || "admin";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "CHANGE_ME";

const GUEST_MINUTES =
    Number(process.env.GUEST_MINUTES || 10);

const TRIAL_DAYS =
    Number(process.env.TRIAL_DAYS || 3);

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

const adminSessions =
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


// ==============================================// GUEST SESSION
// ==============================================
app.post(
    "/api/guest/start",
    (req, res) => {

        const token =
            generateToken();

        const startedAt =
            Date.now();

        const expiresAt =
            startedAt +
            GUEST_MINUTES *
            60 *
            1000;

        res.json({

            success: true,

            guestToken:
                token,

            startedAt:
                new Date(
                    startedAt
                ).toISOString(),

            expiresAt:
                new Date(
                    expiresAt
                ).toISOString(),

            minutes:
                GUEST_MINUTES
        });
    }
);


app.get(
    "/api/guest/status",
    (req, res) => {

        const expiresAt =
            Number(
                req.query.expiresAt
            );

        if (
            !expiresAt ||
            Number.isNaN(
                expiresAt
            )
        ) {

            return res.status(400)
                .json({
                    error:
                        "Guest sessiyasi topilmadi."
                });
        }

        const remaining =
            Math.max(
                0,
                expiresAt -
                Date.now()
            );

        res.json({

            active:
                remaining > 0,

            remainingMs:
                remaining,

            remainingSeconds:
                Math.floor(
                    remaining /
                    1000
                )
        });
    }
);


// ==============================================// GEMINI LIVE TOKEN
// ==============================================
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

            return res.json({

                success:
                    true,

                token:
                    token.name,

                model:
                    LIVE_MODEL
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


// ==============================================// NORMAL CHAT
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

            const result =
                await ai.models.generateContent({

                    model:
                        CHAT_MODEL,

                    contents:
                        message,

                    config: {

                        systemInstruction:
                            TEACHER_INSTRUCTION
                    }
                });

            return res.json({

                success:
                    true,

                reply:
                    result.text ||
                    "Javob olinmadi."
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


// ==============================================// ADMIN AUTH MIDDLEWARE
// ==============================================
function requireAdmin(
    req,
    res,
    next
) {

    const auth =
        req.headers.authorization ||
        "";

    const token =
        auth.replace(
            /^Bearer\s+/i,
            ""
        );

    if (!token) {

        return res.status(401)
            .json({
                success:
                    false,

                error:
                    "Admin sessiyasi mavjud emas."
            });
    }

    if (
        !adminSessions.has(token)
    ) {

        return res.status(401)
            .json({
                success:
                    false,

                error:
                    "Admin sessiyasi tugagan."
            });
    }

    req.adminToken =
        token;

    next();
}


// ==============================================// ADMIN LOGIN
// ==============================================
app.post(
    "/api/admin/login",
    (req, res) => {

        const username =
            String(
                req.body?.username ||
                ""
            ).trim();

        const password =
            String(
                req.body?.password ||
                ""
            );

        if (
            username !==
            ADMIN_USERNAME ||
            password !==
            ADMIN_PASSWORD
        ) {

            return res.status(401)
                .json({

                    success:
                        false,

                    error:
                        "Login yoki parol noto‘g‘ri."
                });
        }

        const token =
            generateToken();

        adminSessions.set(
            token,
            {
                username,
                createdAt:
                    Date.now()
            }
        );

        console.log(
            "🔐 ADMIN LOGIN:",
            username
        );

        return res.json({

            success:
                true,

            token,

            admin: {
                username
            }
        });
    }
);


// ==============================================// ADMIN LOGOUT
// ==============================================
app.post(
    "/api/admin/logout",
    requireAdmin,
    (req, res) => {

        adminSessions.delete(
            req.adminToken
        );

        res.json({
            success:
                true
        });
    }
);


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
