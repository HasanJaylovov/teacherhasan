
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
                    credentials: "same-origin"
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
            sampleRate: 24000
        });

        await audioContext.resume();

        nextAudioTime = audioContext.currentTime;

        console.log("🔊 AudioContext tayyor");

        // EPHEMERAL TOKEN
        const tokenResponse = await fetch("/api/live-token");

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

                systemInstruction: `
Siz TEACHER HASANsiz.

O'zbekistondagi o'quvchilarga ingliz tilini
o'rgatuvchi professional, samimiy va sabrli
AI English Teacher bo'ling.

Asosan ravon o'zbek tilida gapiring.

Inglizcha misollarni sodda tushuntiring.

O'quvchi inglizcha gapirsa:
- xatolarini muloyim tuzating;
- to'g'ri variantni ayting;
- o'zbek tilida qisqa tushuntiring.

A1-C1 darajaga moslashing.

Speaking mashqlarida inglizcha savollar bering.

Grammar, Vocabulary, Fluency va
Pronunciation bo'yicha qisqa maslahat bering.

Javoblarni juda uzun qilmang.

Tabiiy suhbat qiling.

O'quvchini doimo rag'batlantiring.

O'zingizni Teacher Hasan deb tanishtiring.
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

        processorNode.onaudioprocess = (event) => {

            if (
                !liveSession ||
                !isRunning
            ) {
                return;
            }

            try {

                const input =
                    event.inputBuffer
                        .getChannelData(0);

                const pcm =
                    floatTo16BitPCM(input);

                const base64 =
                    arrayBufferToBase64(pcm);

                liveSession.sendRealtimeInput({
                    audio: {
                        data: base64,
                        mimeType:
                            "audio/pcm;rate=24000"
                    }
                });

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