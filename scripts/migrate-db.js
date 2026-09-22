import "dotenv/config";
import fs from "fs";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL topilmadi.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

try {
    const sql = fs.readFileSync(
        new URL("../database-schema.sql", import.meta.url),
        "utf8"
    );

    console.log("⏳ PostgreSQL schema yaratilmoqda...");

    await pool.query(sql);

    console.log("✅ PostgreSQL schema muvaffaqiyatli yaratildi.");

    const result = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM payments) AS payments,
            (SELECT COUNT(*) FROM speaking_results) AS speaking_results
    `);

    console.log("📊 Database holati:", result.rows[0]);
} catch (error) {
    console.error("❌ PostgreSQL migration error:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
