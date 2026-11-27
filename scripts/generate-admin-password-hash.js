import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Run this script in an interactive terminal so the password can be entered without echo.");
    process.exit(1);
}

const input = process.stdin;
const output = process.stdout;
const chunks = [];
let finished = false;

output.write("Admin password (input hidden): ");
input.setRawMode(true);
input.resume();
input.setEncoding("utf8");

function finish() {
    if (finished) return;
    finished = true;
    input.setRawMode(false);
    input.pause();
    output.write("\n");
}

input.on("data", async (chunk) => {
    for (const char of chunk) {
        if (char === "\u0003") {
            finish();
            process.exit(130);
        }
        if (char === "\r" || char === "\n") {
            finish();
            const password = chunks.join("");
            if (password.length < 12) {
                console.error("Use an admin password with at least 12 characters.");
                process.exit(1);
            }
            const salt = crypto.randomBytes(16);
            const derived = Buffer.from(await scrypt(password, salt, 64));
            console.log("ADMIN_PASSWORD_HASH=scrypt$" +
                salt.toString("base64url") + "$" +
                derived.toString("base64url"));
            process.exit(0);
        }
        if (char === "\u007f" || char === "\b") {
            chunks.pop();
        } else if (char >= " ") {
            chunks.push(char);
        }
    }
});
