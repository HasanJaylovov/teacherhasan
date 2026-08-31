import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
const DATA_DIR =
    path.join(__dirname, "data");

const DATA_FILE =
    path.join(DATA_DIR, "database.json");

function createDatabase() {

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {
            recursive: true
        });
    }

    if (!fs.existsSync(DATA_FILE)) {

        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(
                {
                    users: [],
                    payments: [],
                    speakingResults: []
                },
                null,
                2
            )
        );
    }
}

function readDatabase() {

    createDatabase();

    try {

        return JSON.parse(
            fs.readFileSync(
                DATA_FILE,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "Database read error:",
            error
        );

        return {
            users: [],
            payments: [],
            speakingResults: []
        };
    }
}

function writeDatabase(data) {

    createDatabase();

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(
            data,
            null,
            2
        )
    );
}


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

function getAuthenticatedUser(req) {

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

    const db =
        readDatabase();

    return (
        db.users || []
    ).find(
        user =>
            String(user.id) ===
            String(userId)
    ) || null;
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
    (req, res) => {

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

            if (
                password.length < 6
            ) {

                return res.status(400)
                    .json({
                        error:
                            "Parol kamida 6 belgidan iborat bo‘lishi kerak."
                    });
            }

            const db =
                readDatabase();

            const exists =
                (db.users || [])
                    .find(user => {

                        if (
                            email &&
                            user.email ===
                            email
                        ) {
                            return true;
                        }

                        if (
                            phone &&
                            user.phone ===
                            phone
                        ) {
                            return true;
                        }

                        return false;
                    });

            if (exists) {

                return res.status(409)
                    .json({
                        error:
                            "Bu email yoki telefon bilan akkaunt allaqachon mavjud."
                    });
            }

            const createdAt =
                new Date();

            const trialUntil =
                new Date(
                    createdAt.getTime() +
                    TRIAL_DAYS *
                    24 *
                    60 *
                    60 *
                    1000
                );

            const user = {

                id:
                    crypto
                        .randomUUID(),

                fullName,

                email:
                    email || "",

                phone:
                    phone || "",

                passwordHash:
                    hashPassword(
                        password
                    ),

                blocked:
                    false,

                subscriptionStatus:
                    "trial",

                plan:
                    null,

                createdAt:
                    createdAt.toISOString(),

                trialUntil:
                    trialUntil.toISOString(),

                expiresAt:
                    null,

                speakingCount:
                    0
            };

            db.users.push(user);

            writeDatabase(db);

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


// ==============================================// LOGIN
// ==============================================
app.post(
    "/api/auth/login",
    (req, res) => {

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

            if (
                !identifier ||
                !password
            ) {

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

            const db =
                readDatabase();

            const user =
                (db.users || [])
                    .find(item =>
                        (
                            item.email &&
                            item.email ===
                            normalizedEmail
                        ) ||
                        (
                            item.phone &&
                            item.phone ===
                            normalizedPhone
                        )
                    );

            if (!user) {

                return res.status(401)
                    .json({
                        error:
                            "Foydalanuvchi topilmadi."
                    });
            }

            if (
                user.passwordHash !==
                hashPassword(
                    password
                )
            ) {

                return res.status(401)
                    .json({
                        error:
                            "Login yoki parol noto‘g‘ri."
                    });
            }

            if (user.blocked) {

                return res.status(403)
                    .json({
                        error:
                            "Akkauntingiz bloklangan."
                    });
            }

            const token =
                generateToken();

            userSessions.set(
                token,
                user.id
            );

            writeDatabase(db);

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


// ==============================================// LOGOUT
// ==============================================
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
    (req, res) => {

        const user =
            getAuthenticatedUser(
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

        const db =
            readDatabase();

        writeDatabase(db);

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
app.get(
    "/api/admin/dashboard",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        const users =
            db.users || [];

        const payments =
            db.payments || [];

        const speakingResults =
            db.speakingResults || [];

        const now =
            Date.now();

        let premium =
            0;

        let trial =
            0;

        let blocked =
            0;

        users.forEach(user => {

            if (user.blocked) {

                blocked++;

                return;
            }

            const access =
                userAccess(user);

            if (
                access.mode ===
                "premium"
            ) {
                premium++;
            }

            if (
                access.mode ===
                "trial"
            ) {
                trial++;
            }
        });

        const successfulPayments =
            payments.filter(
                payment =>
                    payment.status ===
                    "success"
            );

        const revenue =
            successfulPayments.reduce(
                (
                    total,
                    payment
                ) =>
                    total +
                    Number(
                        payment.amount ||
                        0
                    ),
                0
            );

        res.json({

            success:
                true,

            stats: {

                users:
                    users.length,

                premium,

                trial,

                blocked,

                payments:
                    successfulPayments.length,

                revenue,

                speakingResults:
                    speakingResults.length,

                serverTime:
                    new Date(
                        now
                    ).toISOString()
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
    }
);


// ==============================================// ADMIN USERS
// ==============================================
app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        res.json({

            success:
                true,

            users:
                db.users || []
        });
    }
);


// ==============================================// ADMIN UPDATE USER
// ==============================================
app.patch(
    "/api/admin/users/:id",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        const user =
            (db.users || [])
                .find(
                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            req.params.id
                        )
                );

        if (!user) {

            return res.status(404)
                .json({

                    success:
                        false,

                    error:
                        "Foydalanuvchi topilmadi."
                });
        }

        const fields = [
            "blocked",
            "subscriptionStatus",
            "plan",
            "expiresAt",
            "trialUntil"
        ];

        fields.forEach(
            field => {

                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            req.body,
                            field
                        )
                ) {

                    user[field] =
                        req.body[field];
                }
            }
        );

        writeDatabase(db);

        res.json({

            success:
                true,

            user
        });
    }
);


// ==============================================// ADMIN PAYMENTS
// ==============================================
app.get(
    "/api/admin/payments",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        res.json({

            success:
                true,

            payments:
                db.payments || []
        });
    }
);


// ==============================================// ADMIN SPEAKING RESULTS
// ==============================================
app.get(
    "/api/admin/speaking-results",
    requireAdmin,
    (req, res) => {

        const db =
            readDatabase();

        res.json({

            success:
                true,

            results:
                db.speakingResults || []
        });
    }
);


// ==============================================// ADMIN SETTINGS
// ==============================================
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
    (req, res) => {

        const db =
            readDatabase();

        const user =
            (db.users || [])
                .find(
                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            req.params.id
                        )
                );

        if (!user) {

            return res.status(404)
                .json({

                    success:
                        false,

                    error:
                        "Foydalanuvchi topilmadi."
                });
        }

        const months =
            Number(
                req.body?.months || 1
            );

        const safeMonths =
            [1, 2, 3].includes(
                months
            )
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

        const now =
            new Date();

        const currentExpiry =
            user.expiresAt
                ? new Date(
                    user.expiresAt
                )
                : now;

        const start =
            currentExpiry > now
                ? currentExpiry
                : now;

        const expires =
            new Date(
                start.getTime() +
                safeMonths *
                30 *
                24 *
                60 *
                60 *
                1000
            );

        user.subscriptionStatus =
            "premium";

        user.plan =
            plan;

        user.expiresAt =
            expires.toISOString();

        user.blocked =
            false;

        // This is an administrator-granted benefit, not a customer payment.
        // Keep an audit record with amount 0 so it never inflates revenue.
        db.payments.push({

            id:
                crypto.randomUUID(),

            userId:
                user.id,

            userName:
                user.fullName,

            plan,

            amount,

            paymentMethod:
                "admin",

            status:
                "success",
            months: safeMonths,

            amount: 0,

            paymentMethod:
                "admin_grant",

            status:
                "admin_grant",

            createdAt:
                now.toISOString()
        });

        writeDatabase(db);

        res.json({

            success:
                true,

            user
        });
    }
);


// ==============================================// MULTICARD PAYMENT PLACEHOLDER
// ==============================================
app.post(
    "/api/payment/create",
    (req, res) => {

        const user =
            getAuthenticatedUser(
                req
            );

        if (!user) {

            return res.status(401)
                .json({

                    success:
                        false,

                    error:
                        "Avval tizimga kiring."
                });
        }

        const months =
            Number(
                req.body?.months || 1
            );

        let amount;
        let plan;

        if (months === 1) {

            amount =
                PLAN_1_MONTH;

            plan =
                "1 oy";

        } else if (
            months === 2
        ) {

            amount =
                PLAN_2_MONTHS;

            plan =
                "2 oy";

        } else if (
            months === 3
        ) {

            amount =
                PLAN_3_MONTHS;

            plan =
                "3 oy";

        } else {

            return res.status(400)
                .json({

                    success:
                        false,

                    error:
                        "Noto‘g‘ri tarif."
                });
        }

        const invoiceId =
            `TH-${Date.now()}-${crypto
                .randomBytes(4)
                .toString("hex")}`;

        const db =
            readDatabase();

        db.payments.push({

            id:
                crypto.randomUUID(),

            invoiceId,

            userId:
                user.id,

            userName:
                user.fullName,

            plan,

            months,

            amount,

            paymentMethod:
                "multicard",

            status:
                "pending",

            createdAt:
                new Date()
                    .toISOString()
        });

        writeDatabase(db);

        /*
         * MULTICARD SHARTNOMASI TAYYOR BO'LGACH,
         * shu joyda Multicard API orqali haqiqiy
         * invoice/payment URL yaratiladi.
         */

        return res.json({

            success:
                true,

            invoiceId,

            amount,

            plan,

            status:
                "pending",

            message:
                "Multicard merchant API hali ulanmagan."
        });
    }
);


// ==============================================// MULTICARD WEBHOOK
// ==============================================
app.post(
    "/api/payment/webhook",
    (req, res) => {

        try {

            const body =
                req.body || {};

            const invoiceId =
                body.invoiceId ||
                body.invoice_id ||
                body.orderId ||
                body.order_id;

            const status =
                String(
                    body.status ||
                    ""
                ).toLowerCase();

            if (!invoiceId) {

                return res.status(400)
                    .json({
                        success:
                            false,

                        error:
                            "invoiceId topilmadi."
                    });
            }

            const db =
                readDatabase();

            const payment =
                (db.payments || [])
                    .find(
                        item =>
                            item.invoiceId ===
                            invoiceId
                    );

            if (!payment) {

                return res.status(404)
                    .json({
                        success:
                            false,

                        error:
                            "Payment topilmadi."
                    });
            }

            /*
             * DIQQAT:
             * Haqiqiy Multicard webhook imzosi
             * tekshirilgandan keyin success
             * qilinishi kerak.
             */

            if (
                [
                    "success",
                    "paid",
                    "completed"
                ].includes(status)
            ) {

                payment.status =
                    "success";

                const user =
                    (db.users || [])
                        .find(
                            item =>
                                String(
                                    item.id
                                ) ===
                                String(
                                    payment.userId
                                )
                        );

                if (user) {

                    const months =
                        Number(
                            payment.months ||
                            1
                        );

                    const now =
                        new Date();

                    const oldExpiry =
                        user.expiresAt
                            ? new Date(
                                user.expiresAt
                            )
                            : now;

                    const start =
                        oldExpiry > now
                            ? oldExpiry
                            : now;

                    const expires =
                        new Date(
                            start.getTime() +
                            months *
                            30 *
                            24 *
                            60 *
                            60 *
                            1000
                        );

                    user.subscriptionStatus =
                        "premium";

                    user.plan =
                        payment.plan;

                    user.expiresAt =
                        expires.toISOString();

                    user.blocked =
                        false;
                }
            }

            writeDatabase(db);

            res.json({
                success:
                    true
            });

        } catch (error) {

            console.error(
                "WEBHOOK ERROR:",
                error
            );

            res.status(500)
                .json({
                    success:
                        false,

                    error:
                        "Webhook xatosi."
                });
        }
    }
);


// ==============================================// 404
// ==============================================
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
