
import { GoogleGenAI } from "https://esm.sh/@google/genai";
// ==========================================
// 👨‍🏫 TEACHER HASAN - GEMINI LIVE
// ==========================================

console.log("📚 Teacher Hasan app.js yuklandi");

let liveSession = null;
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;

let isRunning = false;

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

    function setStatus(text) {
        status.textContent = text;
    }

    // ==========================================
    // TRANSCRIPT
    // ==========================================

    function addTranscript(text) {

        if (!text) return;

        const oldText = transcript.textContent.trim();

        transcript.textContent =
            oldText
                ? oldText + "\n" + text
                : text;

        transcript.scrollTop =
            transcript.scrollHeight;
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

            for (
                let i = 0;
                i < samples.length;
                i++
            ) {

                channel[i] =
                    samples[i] / 32768;
            }

            const audioSource =
                audioContext.createBufferSource();

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
    if (isRunning) return;

    try {
        console.log("🎤 START bosildi");

        startBtn.disabled = true;
        stopBtn.disabled = false;

        setStatus("🔄 Teacher Hasan ulanmoqda...");

        // ACCESS / GUEST PREFLIGHT
        const accessData =
            await startGuestSession();

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
Siz TEACHER HASANsiz.

Siz ikki tilli AI Teacher bo'lib,
O'ZBEK TILI va RUS TILIDA ravon muloqot qilasiz.

Siz quyidagi 7 ta tilni to'liq o'rgatasiz:

1. 🇬🇧 English
2. 🇩🇪 German
3. 🇸🇦 Arabic
4. 🇷🇺 Russian
5. 🇹🇷 Turkish
6. 🇰🇷 Korean
7. 🇨🇳 Chinese

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
`,

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

                    addTranscript(
                        "👨‍🏫 Teacher Hasan: Salom! Men Teacher Hasanman. Ingliz tilini birga mashq qilamiz."
                    );
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
                        addTranscript(
                            "👤 Siz: " + inputText
                        );
                    }

                    // TEACHER TRANSCRIPT
                    const outputText =
                        message
                            ?.serverContent
                            ?.outputTranscription
                            ?.text;

                    if (outputText) {
                        addTranscript(
                            "👨‍🏫 Teacher Hasan: " +
                            outputText
                        );
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

        console.error(
            "❌ Teacher Hasan start xatosi:",
            error
        );

        if (guestMode) {
            await stopGuestSession();
        }

        setStatus(
            "❌ Xato: " + error.message
        );

        if (error.code === "guest_exhausted") {
            setTimeout(() => {
                location.replace("/login.html");
            }, 800);
        }

        startBtn.disabled = false;
        stopBtn.disabled = true;

        isRunning = false;
    }
}
      function stopTeacher() {
        console.log(
            "🔴 Teacher Hasan STOP"
        );

        if (guestMode) {
            void stopGuestSession();
        }

        isRunning = false;

        // ==================================
        // PROCESSOR
        // ==================================

        if (processorNode) {

            processorNode.disconnect();

            processorNode.onaudioprocess =
                null;

            processorNode = null;
        }

        // ==================================
        // MICROPHONE SOURCE
        // ==================================

        if (sourceNode) {

            sourceNode.disconnect();

            sourceNode = null;
        }

        // ==================================
        // MICROPHONE STREAM
        // ==================================

        if (mediaStream) {

            mediaStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

            mediaStream = null;
        }

        // ==================================
        // GEMINI SESSION
        // ==================================

        if (liveSession) {

            try {

                liveSession.close();

            } catch (error) {

                console.warn(
                    "Session yopishda xato:",
                    error
                );
            }

            liveSession = null;
        }

        // ==================================
        // AUDIO CONTEXT
        // ==================================

        if (audioContext) {

            try {

                audioContext.close();

            } catch (error) {

                console.warn(
                    "AudioContext yopishda xato:",
                    error
                );
            }

            audioContext = null;
        }

        startBtn.disabled = false;
        stopBtn.disabled = true;

        setStatus(
            "⚪ Tayyor. Start tugmasini bosing."
        );

        console.log(
            "✅ Teacher Hasan to'xtatildi"
        );
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
        stopTeacher
    );

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