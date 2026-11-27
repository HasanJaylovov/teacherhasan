import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(challengeId, otp, pepper) {
    return crypto
        .createHmac("sha256", String(pepper))
        .update(`${challengeId}:${otp}`)
        .digest("hex");
}

export function safeEqualHex(left, right) {
    if (
        typeof left !== "string" ||
        typeof right !== "string" ||
        !/^[a-f0-9]{64}$/i.test(left) ||
        !/^[a-f0-9]{64}$/i.test(right)
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(left, "hex"),
        Buffer.from(right, "hex")
    );
}

export function hashSessionToken(token) {
    return crypto
        .createHash("sha256")
        .update(String(token))
        .digest("hex");
}

export async function hashAdminPassword(password, salt = crypto.randomBytes(16)) {
    const derived = await scrypt(String(password), salt, 64);
    return `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyAdminPassword(password, encodedHash) {
    if (typeof encodedHash !== "string") return false;

    const parts = encodedHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;

    let salt;
    let expected;
    try {
        salt = Buffer.from(parts[1], "base64url");
        expected = Buffer.from(parts[2], "base64url");
    } catch {
        return false;
    }

    if (salt.length < 16 || expected.length !== 64) return false;

    const actual = Buffer.from(
        await scrypt(String(password), salt, expected.length)
    );

    return crypto.timingSafeEqual(actual, expected);
}

export function readCookie(cookieHeader, name) {
    for (const part of String(cookieHeader || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;

        const key = part.slice(0, index).trim();
        if (key !== name) continue;

        try {
            return decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            return null;
        }
    }

    return null;
}

export function buildAdminSessionCookie(token, {
    secure = true,
    maxAgeSeconds = 28800
} = {}) {
    return [
        `th_admin_session=${encodeURIComponent(token)}`,
        `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
        "Path=/api/admin",
        "HttpOnly",
        "SameSite=Strict",
        ...(secure ? ["Secure"] : [])
    ].join("; ");
}

export function clearAdminSessionCookie({ secure = true } = {}) {
    return [
        "th_admin_session=",
        "Max-Age=0",
        "Path=/api/admin",
        "HttpOnly",
        "SameSite=Strict",
        ...(secure ? ["Secure"] : [])
    ].join("; ");
}
