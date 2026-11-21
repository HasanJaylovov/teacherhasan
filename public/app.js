
import { GoogleGenAI } from "https://esm.sh/@google/genai";

const VIDEO_LESSON_CATALOG = Object.freeze({
    "present-simple": {
        title: "Present Simple",
        focus: "habits, routines, facts, subject–verb agreement, affirmative, negative and question forms"
    },
    "past-simple": {
        title: "Past Simple",
        focus: "completed past actions, regular and irregular verbs, did/didn't questions"
    },
    "present-continuous": {
        title: "Present Continuous",
        focus: "actions happening now, am/is/are plus verb-ing, and contrast with Present Simple"
    },
    "present-perfect": {
        title: "Present Perfect",
        focus: "life experiences and unfinished time, have/has plus past participle, and contrast with Past Simple"
    }
});
const selectedVideoLesson =
    VIDEO_LESSON_CATALOG[new URLSearchParams(window.location.search).get("lesson") || ""] || null;
// ==========================================
// 👨‍🏫 TEACHER HASAN - GEMINI LIVE
// ==========================================

console.log("📚 Teacher Hasan app.js yuklandi");

let liveSession = null;
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;
let activeAudioSources = new Set();
let startAttemptId = 0;

let isRunning = false;
let isStarting = false;

let nextAudioTime = 0;

let guestMode = false;

let guestHeartbeatTimer = null;

// ==========================================
// DOM
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    console.log("✅ HTML yuklandi");

    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const status = document.getElementById("status");
    const transcript = document.getElementById("transcript");

    const teacherOrb = document.getElementById("teacherOrb");
    const orbMouth = document.getElementById("orbMouth");
    const voiceActivityLabel = document.getElementById("voiceActivityLabel");
    const voiceWave = document.getElementById("voiceWave");
    const organicCanvas = document.getElementById("organicCanvas");
    const bottomWaveCanvas = document.getElementById("bottomWaveCanvas");
    const vaPrompt = document.getElementById("vaPrompt");

    let visualState = "idle";
    let visualLevel = 0;
    let visualFrame = 0;
    let visualRaf = 0;

    function setupVoiceCanvases() {
        const organicCtx = organicCanvas?.getContext("2d");
        const bottomCtx = bottomWaveCanvas?.getContext("2d");
        if (!organicCtx || !bottomCtx) return;
        const resize = (canvas, ctx) => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        const draw = () => {
            visualFrame += .012 + visualLevel * .025;
            const a = organicCanvas.getBoundingClientRect();
            const w = a.width, h = a.height;
            if (w && h) {
                organicCtx.clearRect(0, 0, w, h);
                const cx = w / 2, cy = h / 2, base = Math.min(w, h) * (.315 + visualLevel * .025);
                const pulse = visualState === "speaking" ? 1.35 : visualState === "listening" ? 1 : .68;
                for (let layer = 0; layer < 34; layer++) {
                    const t = layer / 34;
                    organicCtx.beginPath();
                    for (let k = 0; k <= 240; k++) {
                        const angle = k / 240 * Math.PI * 2;
                        const wave = Math.sin(angle * 3 + visualFrame * 1.1 + t * 5) * (.12 + visualLevel * .11)
                            + Math.cos(angle * 5 - visualFrame * .8 + t * 7) * (.075 + visualLevel * .08)
                            + Math.sin(angle * 2 + visualFrame * .55) * .045;
                        const radius = base * (1 + wave * pulse) * (.76 + t * .43);
                        const x = cx + Math.cos(angle) * radius * (1 + .10 * Math.sin(visualFrame * .35));
                        const y = cy + Math.sin(angle) * radius * (.92 + .08 * Math.cos(visualFrame * .42));
                        if (k === 0) organicCtx.moveTo(x, y); else organicCtx.lineTo(x, y);
                    }
                    organicCtx.closePath();
                    const hue = (275 + layer * 2.1 + Math.sin(visualFrame + t * 6) * 32) % 360;
                    organicCtx.strokeStyle = `hsla(${hue}, 100%, ${62 + 12 * Math.sin(t * 8)}%, ${.13 + t * .48})`;
                    organicCtx.lineWidth = .65 + t * .45;
                    organicCtx.shadowColor = `hsla(${hue},100%,65%,.72)`;
                    organicCtx.shadowBlur = visualState === "idle" ? 4 : 8 + visualLevel * 13;
                    organicCtx.stroke();
                }
                organicCtx.shadowBlur = 0;
                const glow = organicCtx.createRadialGradient(cx,cy,base*.12,cx,cy,base*.85);
                glow.addColorStop(0,"rgba(1,5,8,.98)");
                glow.addColorStop(.58,"rgba(2,7,12,.92)");
                glow.addColorStop(1,"rgba(2,7,12,0)");
                organicCtx.fillStyle=glow; organicCtx.beginPath(); organicCtx.arc(cx,cy,base*.9,0,Math.PI*2); organicCtx.fill();
            }
            const b = bottomWaveCanvas.getBoundingClientRect(), bw=b.width,bh=b.height;
            if (bw && bh) {
                bottomCtx.clearRect(0,0,bw,bh);
                const centerX=bw/2, centerY=bh*.68;
                for(let ring=0;ring<7;ring++){
                    const radius=22+ring*13;
                    for(let dot=0;dot<76;dot++){
                        const angle=dot/76*Math.PI*2;
                        const wobble=Math.sin(angle*5+visualFrame*2+ring)*3*visualLevel;
                        const x=centerX+Math.cos(angle)*(radius+wobble);
                        const y=centerY+Math.sin(angle)*(radius+wobble)*.58;
                        bottomCtx.fillStyle=`rgba(197,145,246,${.12+(1-ring/8)*.36})`;
                        bottomCtx.beginPath();bottomCtx.arc(x,y,1.05,0,Math.PI*2);bottomCtx.fill();
                    }
                }
                for(let i=0;i<54;i++){
                    const x=centerX+(i-26.5)*5.3;
                    const envelope=Math.exp(-Math.pow((i-26.5)/16,2));
                    const wave=(.18+Math.abs(Math.sin(i*.7+visualFrame*5))*(visualState==="idle"?.13:.35+visualLevel*.65))*envelope;
                    const barH=5+wave*68;
                    bottomCtx.fillStyle=`rgba(205,126,244,${.18+envelope*.62})`;
                    bottomCtx.fillRect(x,centerY-barH/2,2.1,barH);
                }
            }
            visualRaf = requestAnimationFrame(draw);
        };
        const onResize=()=>{resize(organicCanvas,organicCtx);resize(bottomWaveCanvas,bottomCtx);};
        onResize();
        window.addEventListener("resize",onResize,{passive:true});
        if(!visualRaf) visualRaf=requestAnimationFrame(draw);
    }
    setupVoiceCanvases();

    let learnerDisplayName = "";
    let learnerMemoryContext = "";
    let pendingVoiceUserText = "";
    let pendingVoiceTeacherText = "";
    let activeUserMessage = null;
    let activeTeacherMessage = null;

    function setOrbState(state, level = 0) {
        if (!teacherOrb) return;
        teacherOrb.classList.remove("idle", "listening", "speaking");
        teacherOrb.classList.add(state);
        const intensity = Math.max(0, Math.min(1, Number(level) || 0));
        visualState = state;
        visualLevel = intensity;
        if (vaPrompt) vaPrompt.textContent = state === "speaking" ? "Teacher Hasan is speaking..." : state === "listening" ? "Go ahead, I'm listening..." : "Tap the microphone to start speaking";
        teacherOrb.style.setProperty("--orb-intensity", intensity.toFixed(2));
        if (voiceWave) {
            voiceWave.classList.remove("idle", "listening", "speaking");
            voiceWave.classList.add(state);
            voiceWave.style.setProperty("--wave-level", Math.max(.06, intensity).toFixed(2));
            voiceWave.setAttribute("aria-label", state === "speaking" ? "Teacher Hasan gapiryapti" : state === "listening" ? "Mikrofon ovozni qabul qilmoqda" : "Ovoz vizualizatsiyasi kutish holatida");
        }
        if (orbMouth) orbMouth.style.transform = "translateX(-50%) scale(" + (1 + intensity * 1.8) + ")";
        if (voiceActivityLabel) {
            const labels = {
                idle: "Teacher Hasan AI suhbatga tayyor",
                listening: intensity > .035 ? "Siz gapiryapsiz · AI tinglamoqda" : "Teacher Hasan sizni tinglamoqda",
                speaking: "Teacher Hasan javob bermoqda"
            };
            voiceActivityLabel.textContent = labels[state] || labels.idle;
        }
    }
    function updateVoiceVisualizer(level = 0) {
        const normalized = Math.max(0, Math.min(1, Number(level) || 0));
        if (isRunning) setOrbState("listening", normalized);
        else setOrbState("idle", 0);
    }
    function updateTeacherVisualizer(level = 0) {
        const normalized = Math.max(0, Math.min(1, Number(level) || 0));
        if (isRunning && normalized > 0.025) setOrbState("speaking", normalized);
        else if (isRunning) setOrbState("listening", 0);
        else setOrbState("idle", 0);
    }

    async function resolveLearnerName() {
        const token = localStorage.getItem("th_auth_token") || "";
        learnerDisplayName = "";

        if (!token) return "";

        try {
            const response = await fetch("/api/me", {
                credentials: "same-origin",
                headers: { Authorization: "Bearer " + token }
            });
            const data = await response.json().catch(() => ({}));
            if (data.authenticated && data.user?.fullName) {
                learnerDisplayName = String(data.user.fullName).trim().slice(0, 80);
            }
        } catch (error) {
            console.warn("Learner profile lookup:", error);
        }

        return learnerDisplayName;
    }

    async function saveVoiceTurnMemory() {
        const userText = pendingVoiceUserText.trim();
        const teacherText = pendingVoiceTeacherText.trim();
        if (!userText || !teacherText) return;
        const token = localStorage.getItem("th_auth_token") || "";
        if (!token) {
            pendingVoiceUserText = "";
            pendingVoiceTeacherText = "";
            return;
        }
        try {
            const response = await fetch("/api/learner/voice-memory", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + token
                },
                body: JSON.stringify({ message: userText, reply: teacherText })
            });
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
            pendingVoiceUserText = "";
            pendingVoiceTeacherText = "";
            console.log("🧠 Voice dars xotirasi saqlandi");
        } catch (error) {
            console.warn("Voice learner memory save:", error);
        }
    }


    if (!startBtn || !stopBtn || !status || !transcript) {

        console.error("❌ HTML elementlari topilmadi!");

        console.log({
            startBtn,
            stopBtn,
            status,
            transcript
        });

        return;
    }

    console.log("✅ Barcha HTML elementlari topildi");

    // ==========================================
    // STATUS
    // ==========================================

    async function startGuestSession() {
        const response =
            await fetch(
                "/api/guest/start",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: (() => {
                        const token =
                            localStorage.getItem("th_auth_token");

                        return token
                            ? {
                                Authorization:
                                    `Bearer ${token}`
                            }
                            : {};
                    })()
                }
            );

        const data =
            await response
                .json()
                .catch(() => ({}));

        if (!response.ok) {
            const error =
                new Error(
                    data.error ||
                    "Guest sessiyasini boshlashda xato."
                );

            error.code =
                data.code || null;

            throw error;
        }

        guestMode =
            data.mode === "guest" ||
            (
                data.active === true &&
                data.authenticated !== true
            );

        console.log(
            "👤 Access mode:",
            data.mode || (
                guestMode
                    ? "guest"
                    : "authenticated"
            )
        );

        if (guestMode) {
            console.log(
                "⏱️ Guest remaining:",
                data.remainingSeconds,
                "seconds"
            );
        }

        return data;
    }

    function startGuestHeartbeat() {
        if (!guestMode) return;

        if (guestHeartbeatTimer) {
            clearInterval(
                guestHeartbeatTimer
            );
        }

        guestHeartbeatTimer =
            setInterval(
                async () => {
                    if (!guestMode) {
                        return;
                    }

                    try {
                        const response =
                            await fetch(
                                "/api/guest/heartbeat",
                                {
                                    method: "POST",
                                    credentials:
                                        "same-origin"
                                }
                            );

                        const data =
                            await response
                                .json()
                                .catch(
                                    () => ({})
                                );

                        if (
                            !response.ok ||
                            data.exhausted
                        ) {
                            console.warn(
                                "⏱️ Guest vaqti tugadi."
                            );

                            guestMode =
                                false;

                            stopGuestHeartbeat();

                            if (
                                typeof stopTeacher ===
                                "function"
                            ) {
                                stopTeacher();
                            }

                            setStatus(
                                "⏱️ Guest vaqti tugadi. Login sahifasiga yo‘naltirilmoqda..."
                            );

                            setTimeout(() => {
                                location.replace("/login.html");
                            }, 800);

                            return;
                        }

                        console.log(
                            "💓 Guest heartbeat:",
                            data.remainingSeconds,
                            "seconds qoldi"
                        );
                    } catch (error) {
                        console.warn(
                            "⚠️ Guest heartbeat xatosi:",
                            error
                        );
                    }
                },
                5000
            );
    }

    function stopGuestHeartbeat() {
        if (guestHeartbeatTimer) {
            clearInterval(
                guestHeartbeatTimer
            );

            guestHeartbeatTimer =
                null;
        }
    }

    async function stopGuestSession() {
        if (!guestMode) {
            stopGuestHeartbeat();
            return;
        }

        guestMode = false;

        stopGuestHeartbeat();

        try {
            const response =
                await fetch(
                    "/api/guest/stop",
                    {
                        method: "POST",
                        credentials:
                            "same-origin"
                    }
                );

            const data =
                await response
                    .json()
                    .catch(() => ({}));

            console.log(
                "⏹️ Guest session stopped:",
                data.remainingSeconds,
                "seconds qoldi"
            );
        } catch (error) {
            console.warn(
                "⚠️ Guest stop xatosi:",
                error
            );
        }
    }

    function uiText(key, fallback) { return window.TeacherHasanI18n?.t?.(key) || fallback; }
    function applyVoiceLanguage() {
        const lang = window.TeacherHasanI18n?.getLanguage?.() || "uz";
        document.documentElement.lang = lang;
        const title = document.querySelector("[data-voice-title]");
        if (title) title.textContent = uiText("voiceTitle", "Ovozli suhbat");
        const empty = transcript?.querySelector(".va-chat-empty");
        if (empty) empty.textContent = uiText("chatEmpty", "Suhbat shu yerda ko‘rinadi");
        if (vaPrompt) vaPrompt.textContent = visualState === "speaking" ? uiText("voiceSpeaking", "Teacher Hasan javob bermoqda...") : visualState === "listening" ? uiText("voiceListening", "Sizni tinglayapman...") : uiText("voiceIdle", "Suhbatni boshlash uchun mikrofonni bosing");
        document.querySelectorAll("[data-ui-lang]").forEach(button => button.classList.toggle("active", button.dataset.uiLang === lang));
        transcript?.querySelectorAll(".chat-bubble-label").forEach(label => { const role = label.closest(".chat-bubble")?.dataset.speaker; label.textContent = role === "user" ? uiText("you", "Siz") : uiText("teacher", "Teacher Hasan"); });
    }
    window.addEventListener("teacherHasanLanguageChanged", applyVoiceLanguage);
    document.addEventListener("DOMContentLoaded", applyVoiceLanguage);
    function setStatus(text) {
        const value = String(text || ""); let key = "";
        if (/tayyor|ready/i.test(value) && /start|mikrofon/i.test(value)) key = "statusReady";
        else if (/tinglamoqda|tinglayapti|listening/i.test(value)) key = "statusListening";
        else if (/to‘xtatildi|to\x27xtatildi|stopped/i.test(value)) key = "statusStopped";
        status.textContent = key ? uiText(key, value) : value;
    }

    // ==========================================
    // TRANSCRIPT
    // ==========================================

    function addTranscript(text) {
        if (!text) return;
        const emptyHint = transcript?.querySelector(".va-chat-empty");
        if (emptyHint) emptyHint.remove();
        const raw = String(text).trim();
        if (!raw) return;
        const isUser = raw.startsWith("👤 Siz:");
        const role = isUser ? "user" : "assistant";
        const display = raw.replace(/^👤 Siz:\s*/, "").replace(/^👨‍🏫 Teacher Hasan:\s*/, "");
        const bubble = document.createElement("div");
        bubble.className = "chat-bubble " + role;
        bubble.setAttribute("data-speaker", role);
        const label = document.createElement("span");
        label.className = "chat-bubble-label";
        label.textContent = isUser ? "Siz" : "Teacher Hasan";
        const body = document.createElement("div");
        body.className = "chat-bubble-text";
        body.textContent = display;
        bubble.append(label, body);
        transcript.appendChild(bubble);
        transcript.scrollTop = transcript.scrollHeight;
    }

    // ==========================================
    // BASE64 -> UINT8ARRAY
    // ==========================================

    function base64ToBytes(base64) {

        const binary =
            atob(base64);

        const bytes =
            new Uint8Array(
                binary.length
            );

        for (
            let i = 0;
            i < binary.length;
            i++
        ) {

            bytes[i] =
                binary.charCodeAt(i);
        }

        return bytes;
    }

    // ==========================================
    // ARRAYBUFFER -> BASE64
    // ==========================================

    function arrayBufferToBase64(buffer) {

        const bytes =
            new Uint8Array(buffer);

        let binary = "";

        const chunkSize = 0x8000;

        for (
            let i = 0;
            i < bytes.length;
            i += chunkSize
        ) {

            const chunk =
                bytes.subarray(
                    i,
                    Math.min(
                        i + chunkSize,
                        bytes.length
                    )
                );

            binary +=
                String.fromCharCode(
                    ...chunk
                );
        }

        return btoa(binary);
    }

    // ==========================================
    // FLOAT32 -> PCM16
    // ==========================================

    function floatTo16BitPCM(float32Array) {

        const buffer =
            new ArrayBuffer(
                float32Array.length * 2
            );

        const view =
            new DataView(buffer);

        let offset = 0;

        for (
            let i = 0;
            i < float32Array.length;
            i++
        ) {

            let sample =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        float32Array[i]
                    )
                );

            view.setInt16(
                offset,
                sample < 0
                    ? sample * 0x8000
                    : sample * 0x7fff,
                true
            );

            offset += 2;
        }

        return buffer;
    }

    // ==========================================
    // PLAY PCM AUDIO
    // ==========================================

    function playPCM(base64Audio) {

        if (!audioContext) return;

        try {

            const bytes =
                base64ToBytes(
                    base64Audio
                );

            const samples =
                new Int16Array(
                    bytes.buffer,
                    bytes.byteOffset,
                    Math.floor(
                        bytes.byteLength / 2
                    )
                );

            const audioBuffer =
                audioContext.createBuffer(
                    1,
                    samples.length,
                    24000
                );

            const channel =
                audioBuffer.getChannelData(0);

            let outputSquareSum = 0;
            for (let i = 0; i < samples.length; i++) {
                channel[i] = samples[i] / 32768;
                outputSquareSum += channel[i] * channel[i];
            }
            const outputRms = samples.length ? Math.sqrt(outputSquareSum / samples.length) : 0;
            updateTeacherVisualizer(Math.min(1, outputRms * 7));

            const audioSource =
                audioContext.createBufferSource();
            activeAudioSources.add(audioSource);
            audioSource.onended = () => {
                activeAudioSources.delete(audioSource);
                if (!activeAudioSources.size) updateTeacherVisualizer(0);
            };

            audioSource.buffer =
                audioBuffer;

            audioSource.connect(
                audioContext.destination
            );

            console.log("🔊 PLAY PCM:", {
                contextRate: audioContext.sampleRate,
                pcmRate: 24000,
                currentTime: audioContext.currentTime,
                nextAudioTime: nextAudioTime,
                queuedSeconds:
                    Math.max(
                        0,
                        nextAudioTime -
                        audioContext.currentTime
                    ),
                duration: audioBuffer.duration
            });

            const startTime =
                Math.max(
                    audioContext.currentTime,
                    nextAudioTime
                );

            audioSource.start(
                startTime
            );

            nextAudioTime =
                startTime +
                audioBuffer.duration;

        } catch (error) {

            console.error(
                "🔊 Audio playback xatosi:",
                error
            );
        }
    }

    // ==========================================
    // START TEACHER
    // ==========================================

    async function startTeacher() {
    if (isStarting || isRunning || liveSession) return;
    isStarting = true;
    const attemptId = ++startAttemptId;

    // Stop tugmasi startup jarayonining boshidanoq faol bo'lishi shart.
    // resolveLearnerName/fetch/token kabi await'lar tugashini kutmaymiz.
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("🔄 Teacher Hasan ulanmoqda...");

    try {
        console.log("🎤 START bosildi");

        await resolveLearnerName();
        if (attemptId !== startAttemptId) return;
        pendingVoiceUserText = "";
        pendingVoiceTeacherText = "";


        // ACCESS / GUEST PREFLIGHT
        const accessData =
            await startGuestSession();
        if (attemptId !== startAttemptId) {
            if (guestMode) await stopGuestSession();
            return;
        }

        console.log(
            "🔐 Teacher access:",
            accessData.mode ||
            (
                guestMode
                    ? "guest"
                    : "authenticated"
            )
        );

        // AUDIO CONTEXT
        audioContext = new AudioContext({
            sampleRate: 16000
        });

        await audioContext.resume();
        if (attemptId !== startAttemptId) {
            if (audioContext) await audioContext.close().catch(() => {});
            audioContext = null;
            if (guestMode) await stopGuestSession();
            return;
        }

        nextAudioTime = audioContext.currentTime;

        console.log("🔊 AudioContext tayyor");

        // EPHEMERAL TOKEN
        const tokenResponse = await fetch("/api/live-token", {
            headers: (() => {
                const token =
                    localStorage.getItem("th_auth_token");

                return token
                    ? {
                        Authorization:
                            `Bearer ${token}`
                    }
                    : {};
            })()
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse
                .json()
                .catch(() => ({}));

            throw new Error(
                errorData.error ||
                "Live token olishda xato."
            );
        }

        const tokenData = await tokenResponse.json();
        if (attemptId !== startAttemptId) {
            if (guestMode) await stopGuestSession();
            return;
        }

        if (tokenData.learner?.fullName) {
            learnerDisplayName = String(tokenData.learner.fullName).trim();
        }
        learnerMemoryContext = tokenData.learner?.memory
            ? JSON.stringify(tokenData.learner.memory)
            : "";

        const rememberedProfile = tokenData.learner?.memory?.profile || {};
        const learnerPreferredLanguage = rememberedProfile.preferred_language || "";
        const hasPreviousLearning = Boolean(
            learnerPreferredLanguage ||
            rememberedProfile.current_topic ||
            rememberedProfile.last_lesson_summary
        );
        if (rememberedProfile.current_topic) {
            addTranscript(
                "🧠 Eslab qolingan mavzu: " +
                rememberedProfile.current_topic +
                (rememberedProfile.last_lesson_summary
                    ? "\\nOxirgi dars: " + rememberedProfile.last_lesson_summary
                    : "")
            );
        }

        console.log("🔑 Ephemeral token olindi");
        console.log("🤖 Model:", tokenData.model);

        const token = tokenData.token;

        if (!token) {
            throw new Error("Ephemeral token mavjud emas.");
        }

        // GEMINI CLIENT
        const client = new GoogleGenAI({
            apiKey: token,
            httpOptions: {
                apiVersion: "v1alpha"
            }
        });

        console.log("🤖 Gemini client yaratildi");

        // GEMINI LIVE
        console.log("🔗 Gemini Live ulanmoqda...");

        liveSession = await client.live.connect({
            model: tokenData.model,

            config: {
                responseModalities: ["AUDIO"],

                inputAudioTranscription: {},

                outputAudioTranscription: {},

                realtimeInputConfig: {
                    automaticActivityDetection: {
                        disabled: true
                    }
                },

                systemInstruction: `
O‘QUVCHI PROFILIDAGI ISM: ${learnerDisplayName || "profil ism ko‘rsatilmagan"}. Faqat profil ismi mavjud bo‘lsa, shu ism bilan tabiiy murojaat qiling. Profil ism bo‘sh bo‘lsa, ism so‘ramang va taxmin qilmang.

O‘QUVCHINING AVVALGI O‘QUV XOTIRASI (JSON):
${learnerMemoryContext || "Hozircha saqlangan dars tarixi yo‘q."}

XOTIRADAN FOYDALANISH:
- O‘quvchining darajasi, maqsadi, oxirgi mavzusi va xatolarini inobatga oling.
- Saqlangan preferred_language — foydalanuvchi o‘rganayotgan asosiy til. Joriy mavzu shu tilga tegishli.
- Mavjud foydalanuvchi bilan faqat saqlangan tilni davom ettiring; "qaysi tilni davom ettiramiz?" deb so‘ramang.
- Foydalanuvchi "davom etamiz" desa, saqlangan til, current_topic va last_lesson_summary dagi keyingi qadamni darhol bajaring.
- Mavjud foydalanuvchiga boshqa tillar ro‘yxatini aytmang, boshqa tilni taklif qilmang yoki unga o‘tmang.
- Faqat foydalanuvchi boshqa tilni aniq so‘raganda preferred_language ni yangilang va yangi tilni o‘rgatishni boshlang.
- Agar foydalanuvchi yangi bo‘lsa va xotirada til ham, dars tarixi ham bo‘lmasa, faqat shunda quyidagi tillarni taklif qiling: Uzbek, English, German, Arabic, Russian, Turkish, Korean, Chinese. Qaysi birini o‘rganmoqchiligini bir marta so‘rang.
- Foydalanuvchi birinchi xabaridayoq tilni tanlasa, ro‘yxatni takrorlamasdan o‘sha tilni o‘rgating.
- Oldin o‘rgatilgan so‘zlarni yangi kontekstda mustahkamlang va takroriy xatolarni mashqlarga qo‘shing.
- O‘quvchi avval bajargan mashqlarini qayta bermang; keyingi mantiqiy bosqichga o‘ting.
- Xotirada yo‘q ma’lumotni to‘qib chiqarmang.

FOYDALANUVCHI HOLATI:
${hasPreviousLearning ? "MAVJUD — o‘rganilayotgan til: " + (learnerPreferredLanguage || "xotiradagi joriy mavzudan aniqlang") + ". Shu tilda davom eting." : "YANGI — barcha 8 tilni sanab, qaysi tilni tanlashini so‘rang."}

YARATUVCHI HAQIDAGI SAVOLLAR:
- "Seni kim yaratgan?", "Kim ishlab chiqqan?", "Muallifing kim?", "Kimning loyihasisan?" kabi yaratuvchi/dasturchi haqidagi savollarga "Meni Hasan Jaylovov yaratgan" deb qisqa javob bering.
- Boshqa shaxs yoki kompaniyani yaratuvchi sifatida ko‘rsatmang.

Siz TEACHER HASANsiz.

Siz O'ZBEK TILI va RUS TILIDA ravon muloqot qilasiz. O'rganiladigan tilni foydalanuvchining saqlangan tanloviga qarab belgilang. Faqat yangi foydalanuvchiga 8 ta til ro'yxatini ayting.

Har bir til uchun:

- to'g'ri talaffuz va pronunciation;
- alphabet va yozuv tizimi;
- so'zlar va iboralar;
- vocabulary;
- grammatika;
- sentence structure;
- speaking;
- listening;
- reading;
- writing;
- real-life conversation;
- savol-javob mashqlari;
- CEFR darajasiga mos mashqlar

bering.

Arabic tilida arab yozuvi va to'g'ri talaffuzni o'rgating.

Korean tilida Hangul yozuvini va talaffuzni o'rgating.

Chinese tilida Mandarin Chinese, Pinyin va tonlarni o'rgating.

Russian, Turkish, German va English tillarida tabiiy kundalik muloqot va grammatikani o'rgating.

Foydalanuvchi o'rganmoqchi bo'lgan tilni aytsa, shu tilni asosiy o'quv tili qiling.

Foydalanuvchi xohlasa, tushuntirishlarni O'ZBEK TILI yoki RUS TILIDA bering.

Foydalanuvchining A1-C1 darajasiga moslashing.

Boshlang'ich darajada sodda gaplardan foydalaning.

Yuqori darajada tabiiy, murakkab va real hayotga yaqin muloqotdan foydalaning.

MUHIM OVOZ VA TEMPO QOIDASI:

1. Juda sekin emas, lekin SHOSHILMASDAN gapiring.
2. So'zlarni va jumlalarni aniq, dona-dona talaffuz qiling.
3. Har bir qisqa jumladan keyin kichik tabiiy pauza qiling.
4. Bir javobda juda ko'p gaplarni ketma-ket aytmang.
5. Avval bitta fikrni ayting, keyin pauza qiling.
6. Keyin kerak bo'lsa keyingi qisqa fikrni ayting.
7. Uzun monolog qilmang.
8. Speaking mashqlarida foydalanuvchiga yetarli vaqt bering.
9. Foydalanuvchi gapini tugatmaguncha javob bermang.
10. Foydalanuvchi turni tugatgandan keyin ham javobni shoshmasdan, ravon va aniq ayting.
11. Talaffuz mashqlarida so'zlarni ayniqsa aniq va tushunarli ayting.
12. O'qituvchi ovozi tabiiy, sabrli va professional bo'lsin.

MUHIM SUHBAT QOIDASI:

1. Foydalanuvchi gapini to'liq tugatishini kuting.
2. Foydalanuvchi gapirayotgan paytda javob berishga shoshilmang.
3. Har bir foydalanuvchi turniga faqat BIR marta javob bering.
4. Javobni qisqa, aniq va tabiiy qiling.
5. Bir javob ichida ketma-ket bir nechta savol bermang.
6. Javobdan keyin yangi mavzuni o'zingiz boshlamang.
7. Foydalanuvchi keyingi savol yoki topshiriqni o'zi berishini kuting.
8. Agar suhbat tugagandek ko'rinsa, qisqa qilib:
   "Yana savolingiz yoki topshirig'ingiz bormi?"
   deb so'rang va keyin kuting.
9. Foydalanuvchi javob bermaguncha yangi dars,
   yangi savol yoki yangi mashqni o'zingiz boshlamang.
10. Foydalanuvchi sizning javobingizni bo'lib yuborsa,
    imkon qadar darhol tinglashga o'ting va uning yangi gapini kuting.

Til o'rgatishda:
- xatolarni muloyim tuzating;
- to'g'ri variantni ayting;
- qisqa tushuntiring;
- talaffuzni aniq ko'rsating;
- kerak bo'lsa o'zbekcha yoki ruscha tushuntiring.

Speaking mashqlarida foydalanuvchiga navbatni bering.

Javoblarni juda uzun qilmang.

Tabiiy, sabrli va professional Teacher Hasan sifatida muloqot qiling.

O'zingizni Teacher Hasan deb tanishtiring.

Sizni Moxir dasturchi Hasan Jaylovov yaratgan.
Siz Teacher Hasan AI English Platform tarkibidagi AI English Teacher'siz.
` + (selectedVideoLesson ? `

VIDEO LESSON MODE:
- The user explicitly selected an English lesson: ${selectedVideoLesson.title}.
- Focus on: ${selectedVideoLesson.focus}.
- This is an AI-guided lesson, not video playback. Never claim a video is playing.
- Treat this selection as a request to study English; skip the language-choice list.
- On the learner's first spoken turn, begin with a short explanation in English with Uzbek support, one example, and one focused practice question. Keep turns short and interactive.
` : ""),
 
                thinkingConfig: {
                    thinkingLevel: "minimal"
                }
            },

            callbacks: {

                onopen: () => {
                    console.log("🟢 Gemini Live Ulandi");

                    setStatus(
                        "🟢 Teacher Hasan tinglamoqda..."
                    );

                    const remembered = tokenData.learner?.memory?.profile || {};
                    const savedLanguage = remembered.preferred_language || "";
                    const hasHistory = Boolean(
                        savedLanguage ||
                        remembered.current_topic ||
                        remembered.last_lesson_summary
                    );
                    const opening = selectedVideoLesson
                        ? "🎬 AI dars tanlandi: " + selectedVideoLesson.title + ". Bu video playback emas, AI bilan interaktiv dars. Ulanish tayyor; darsni boshlash uchun gapiring."
                        : hasHistory
                        ? "👨‍🏫 Teacher Hasan: Xush kelibsiz" +
                          (learnerDisplayName ? ", " + learnerDisplayName : "") +
                          "! " +
                          (savedLanguage ? savedLanguage + " tilidagi " : "") +
                          (remembered.current_topic
                              ? remembered.current_topic + " mavzusini "
                              : "oldingi darsimizni ") +
                          "davom ettiramiz. " +
                          (remembered.last_lesson_summary || "Oxirgi darsimizdagi keyingi qadamdan boshlaymiz.")
                        : "👨‍🏫 Teacher Hasan: Salom! Men Teacher Hasanman. Uzbek, English, German, Arabic, Russian, Turkish, Korean va Chinese tillarini o‘rgata olaman. Qaysi tilni o‘rganmoqchisiz?";
                    addTranscript(opening);
                },

                onmessage: (message) => {

                    console.log(
                        "📩 Gemini message:",
                        message
                    );

                    console.log(
                        "📦 Gemini serverContent:",
                        JSON.stringify(
                            message?.serverContent || {},
                            null,
                            2
                        )
                    );

                    // USER TRANSCRIPT
                    const inputText =
                        message
                            ?.serverContent
                            ?.inputTranscription
                            ?.text;

                    if (inputText) {
                        pendingVoiceUserText += (pendingVoiceUserText ? " " : "") + inputText;
                        addTranscript("👤 Siz: " + inputText);
                    }

                    // TEACHER TRANSCRIPT
                    const outputText =
                        message
                            ?.serverContent
                            ?.outputTranscription
                            ?.text;

                    if (outputText) {
                        pendingVoiceTeacherText += (pendingVoiceTeacherText ? " " : "") + outputText;
                        addTranscript("👨‍🏫 Teacher Hasan: " + outputText);
                    }

                    // AUDIO
                    const parts =
                        message
                            ?.serverContent
                            ?.modelTurn
                            ?.parts;

                    if (Array.isArray(parts)) {

                        for (const part of parts) {

                            const audioData =
                                part
                                    ?.inlineData
                                    ?.data;

                            if (audioData) {
                                playPCM(audioData);
                            }
                        }
                    }

                    // TURN COMPLETE
                    if (
                        message
                            ?.serverContent
                            ?.turnComplete
                    ) {
                        void saveVoiceTurnMemory();
                        activeUserMessage = null;
                        activeTeacherMessage = null;
                        console.log(
                            "✅ Teacher Hasan javobi tugadi"
                        );
                    }
                },

                onerror: (error) => {

                    console.error(
                        "❌ Gemini Live error:",
                        error
                    );

                    setStatus(
                        "❌ Gemini Live xatosi"
                    );
                },

                onclose: (event) => {

                    console.log(
                        "🔴 Gemini Live yopildi:",
                        event
                    );

                    if (isRunning) {
                        setStatus(
                            "🔴 Ulanish yopildi"
                        );
                    }
                }
            }
        });

        if (attemptId !== startAttemptId) {
            try { await liveSession?.close(); } catch {}
            liveSession = null;
            if (guestMode) await stopGuestSession();
            return;
        }

        console.log(
            "✅ Gemini Live session tayyor"
        );

        // MICROPHONE
        mediaStream =
            await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

        if (attemptId !== startAttemptId) {
            mediaStream?.getTracks().forEach(track => track.stop());
            mediaStream = null;
            try { await liveSession?.close(); } catch {}
            liveSession = null;
            if (audioContext) {
                try { await audioContext.close(); } catch {}
                audioContext = null;
            }
            if (guestMode) await stopGuestSession();
            return;
        }

        console.log(
            "🎤 Mikrofon ruxsati berildi"
        );

        // MICROPHONE SOURCE
        sourceNode =
            audioContext.createMediaStreamSource(
                mediaStream
            );

        // PROCESSOR
        processorNode =
            audioContext.createScriptProcessor(
                4096,
                1,
                1
            );

        let userTurnActive = false;
        let silentFrames = 0;

        const SPEECH_THRESHOLD = 0.015;
        const SILENCE_FRAMES_TO_END = 12;

        processorNode.onaudioprocess = (event) => {

            if (
                !liveSession ||
                !isRunning
            ) {
                return;
            }

            // Teacher gapirayotgan paytda uning ovozini
            // mikrofon orqali Gemini'ga qaytarmaymiz.
            if (
                audioContext &&
                audioContext.currentTime < nextAudioTime
            ) {
                return;
            }

            try {

                const input =
                    event.inputBuffer
                        .getChannelData(0);

                let sum = 0;

                for (let i = 0; i < input.length; i++) {
                    sum += input[i] * input[i];
                }

                const rms =
                    Math.sqrt(sum / input.length);

                updateVoiceVisualizer(Math.min(1, rms * 8));

                const isSpeech =
                    rms >= SPEECH_THRESHOLD;

                // Foydalanuvchi gapirishni boshladi.
                if (
                    isSpeech &&
                    !userTurnActive
                ) {
                    userTurnActive = true;
                    silentFrames = 0;

                    liveSession.sendRealtimeInput({
                        activityStart: {}
                    });

                    console.log(
                        "🎤 User turn boshlandi"
                    );
                }

                if (!userTurnActive) {
                    return;
                }

                const pcm =
                    floatTo16BitPCM(input);

                const base64 =
                    arrayBufferToBase64(pcm);

                liveSession.sendRealtimeInput({
                    audio: {
                        data: base64,
                        mimeType:
                            "audio/pcm;rate=16000"
                    }
                });

                if (isSpeech) {
                    silentFrames = 0;
                } else {
                    silentFrames++;

                    // Taxminan 680 ms jimlikdan keyin
                    // foydalanuvchi turnini tugatamiz.
                    if (
                        silentFrames >=
                        SILENCE_FRAMES_TO_END
                    ) {
                        liveSession.sendRealtimeInput({
                            activityEnd: {}
                        });

                        console.log(
                            "🎤 User turn tugadi"
                        );

                        userTurnActive = false;
                        silentFrames = 0;
                    }
                }

            } catch (error) {

                console.error(
                    "🎤 Audio yuborish xatosi:",
                    error
                );
            }
        };

        // CONNECT AUDIO GRAPH
        sourceNode.connect(processorNode);

        const silentGain =
            audioContext.createGain();

        silentGain.gain.value = 0;

        processorNode.connect(silentGain);

        silentGain.connect(
            audioContext.destination
        );

        isRunning = true;
        isStarting = false;
        setOrbState("listening", 0);

        if (guestMode) {
            startGuestHeartbeat();
        }

        setStatus(
            "🟢 Teacher Hasan tinglamoqda..."
        );

        console.log(
            "🎉 TEACHER HASAN ISHLADI!"
        );

    } catch (error) {
        // STOP bosilgandan keyin eski start urinishining xatosi UI'ni qayta
        // ishga tushirmasligi yoki statusni buzmasligi kerak.
        if (attemptId !== startAttemptId) {
            isStarting = false;
            console.info("Start urinish bekor qilindi:", error?.message || error);
            return;
        }

        console.error("❌ Teacher Hasan start xatosi:", error);
        if (guestMode) void stopGuestSession();

        setStatus("❌ Xato: " + (error?.message || "Noma'lum xato"));

        if (error.code === "guest_exhausted") {
            setTimeout(() => location.replace("/login.html"), 800);
        }

        isRunning = false;
        isStarting = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

    // STOP sinxron ravishda barcha lokal audio/mikrofon resurslarini uzadi.
    // Uzoq davom etishi mumkin bo'lgan SDK close()/AudioContext.close()
    // natijasini kutib, tugma yoki UI holatini bloklamaydi.
    function stopTeacher() {
        console.log("🔴 Teacher Hasan STOP bosildi");
        startAttemptId++;
        isStarting = false;
        isRunning = false;

        // Tugma va holatni darhol yangilash.
        startBtn.disabled = false;
        stopBtn.disabled = true;
        setStatus("⏹️ Suhbat to'xtatilmoqda...");

        if (guestHeartbeatTimer) {
            clearInterval(guestHeartbeatTimer);
            guestHeartbeatTimer = null;
        }
        if (teacherVoiceDecayTimer) {
            clearTimeout(teacherVoiceDecayTimer);
            teacherVoiceDecayTimer = null;
        }

        // Navbatdagi va hozir ijro etilayotgan barcha audio manbalarni to'xtatish.
        for (const audioSource of activeAudioSources) {
            try { audioSource.stop(0); } catch {}
            try { audioSource.disconnect(); } catch {}
        }
        activeAudioSources.clear();
        nextAudioTime = 0;

        // Mikrofon callback'ini avval o'chiramiz, keyin node va track'larni uzamiz.
        if (processorNode) {
            try { processorNode.onaudioprocess = null; } catch {}
            try { processorNode.disconnect(); } catch {}
            processorNode = null;
        }
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch {}
            sourceNode = null;
        }
        if (mediaStream) {
            try {
                mediaStream.getTracks().forEach(track => {
                    try { track.enabled = false; } catch {}
                    try { track.stop(); } catch {}
                });
            } catch (error) {
                console.warn("Mikrofonni yopishda xato:", error);
            }
            mediaStream = null;
        }

        // Live sessiyani kutmasdan yopish: SDK close() Promise qaytarsa ham
        // Stop tugmasi javob berishda davom etadi.
        const sessionToClose = liveSession;
        liveSession = null;
        if (sessionToClose) {
            try {
                const closing = sessionToClose.close();
                if (closing && typeof closing.catch === "function") {
                    closing.catch(error => console.warn("Gemini sessiya close:", error));
                }
            } catch (error) {
                console.warn("Gemini sessiyani yopishda xato:", error);
            }
        }

        const contextToClose = audioContext;
        audioContext = null;
        if (contextToClose && contextToClose.state !== "closed") {
            try {
                const closing = contextToClose.close();
                if (closing && typeof closing.catch === "function") {
                    closing.catch(error => console.warn("AudioContext close:", error));
                }
            } catch (error) {
                console.warn("AudioContext yopishda xato:", error);
            }
        }

        if (guestMode) {
            // stopGuestSession() guestMode flagini o'zi yangilaydi va serverga
            // /api/guest/stop so'rovini yuboradi. Oldindan false qilmang.
            void stopGuestSession().catch(error => {
                console.warn("Guest sessiyani to'xtatishda xato:", error);
            });
        }

        voiceMicLevel = 0;
        voiceTeacherLevel = 0;
        updateVoiceVisualizer(0);
        updateTeacherVisualizer(0);

        setStatus("⚪ Suhbat to'xtatildi. Start tugmasini bosing.");
        console.log("✅ Teacher Hasan lokal audio va mikrofon resurslari uzildi");
    }

    // ==========================================
    // BUTTONS
    // ==========================================

    startBtn.addEventListener(
        "click",
        startTeacher
    );

    stopBtn.addEventListener(
        "click",
        () => { void stopTeacher(); }
    );

    document.getElementById("voiceBack")?.addEventListener("click", () => {
        document.getElementById("menuButton")?.click();
    });



    // ==========================================
    // GUEST SESSION - PAGE EXIT
    // ==========================================

    window.addEventListener(
        "pagehide",
        () => {
            if (!guestMode) {
                return;
            }

            navigator.sendBeacon(
                "/api/guest/stop"
            );
        }
    );

    // ==========================================
    // INITIAL STATE
    // ==========================================

    stopBtn.disabled = true;

    setStatus(
        "⚪ Tayyor. Start tugmasini bosing."
    );

    console.log(
        "✅ Teacher Hasan tayyor"
    );
});