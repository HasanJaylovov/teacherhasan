(() => {
    "use strict";

    const STORAGE_KEY = "th_ui_lang";

    const translations = {
        uz: {
            voiceTitle: "Ovozli suhbat",
            voiceListening: "Sizni tinglayapman...",
            voiceSpeaking: "Teacher Hasan javob bermoqda...",
            voiceIdle: "Suhbatni boshlash uchun mikrofonni bosing",
            chatEmpty: "Suhbat shu yerda ko‘rinadi",
            you: "Siz",
            teacher: "Teacher Hasan",
            statusReady: "Tayyor. Suhbatni boshlash uchun mikrofonni bosing.",
            statusListening: "Teacher Hasan sizni tinglayapti...",
            statusStopped: "Suhbat to‘xtatildi. Davom etish uchun mikrofonni bosing.",
            remembered: "Oldingi darsingiz eslandi. Davom etamiz.",

            login: "Kirish",
            register: "Ro‘yxatdan o‘tish",
            profile: "Profil",
            logout: "Chiqish",
            language: "Til",
            teacherHasan: "Teacher Hasan AI",
            personalTeacher: "Sizning shaxsiy AI Language Teacher'ingiz",
            liveAI: "✨ Teacher Hasan live AI",
            ready: "⚪ Tayyor. Start tugmasini bosing.",
            start: "Boshlash",
            stop: "To‘xtatish",

            main: "Asosiy",
            home: "Home",
            speakingExam: "Speaking Exam",
            speakingExamDesc: "CEFR Speaking imtihoni",
            videoLessons: "Video Lessons",
            videoLessonsDesc: "CEFR skill videolari",
            englishPractice: "English Practice",
            englishPracticeDesc: "Vocabulary va testlar",
            cefrAssessment: "CEFR Assessment",
            cefrAssessmentDesc: "Reading • Listening • Writing",
            account: "Hisob",
            profileDesc: "Shaxsiy profilingiz",
            loginDesc: "Hisobga kirish",
            registerDesc: "Yangi hisob yaratish"
        },

        ru: {
            voiceTitle: "Голосовой чат",
            voiceListening: "Я вас слушаю...",
            voiceSpeaking: "Teacher Hasan отвечает...",
            voiceIdle: "Нажмите на микрофон, чтобы начать разговор",
            chatEmpty: "Здесь будет отображаться беседа",
            you: "Вы",
            teacher: "Teacher Hasan",
            statusReady: "Готово. Нажмите на микрофон, чтобы начать.",
            statusListening: "Teacher Hasan вас слушает...",
            statusStopped: "Разговор остановлен. Нажмите на микрофон, чтобы продолжить.",
            remembered: "Я помню ваш предыдущий урок. Продолжим.",

            login: "Войти",
            register: "Регистрация",
            profile: "Профиль",
            logout: "Выйти",
            language: "Язык",
            teacherHasan: "Teacher Hasan AI",
            personalTeacher: "Ваш персональный AI-преподаватель языков",
            liveAI: "✨ Teacher Hasan live AI",
            ready: "⚪ Готово. Нажмите Start.",
            start: "Начать",
            stop: "Остановить",

            main: "Основное",
            home: "Главная",
            speakingExam: "Устный экзамен",
            speakingExamDesc: "Экзамен CEFR Speaking",
            videoLessons: "Видео-уроки",
            videoLessonsDesc: "Видео по навыкам CEFR",
            englishPractice: "Практика английского",
            englishPracticeDesc: "Словарный запас и тесты",
            cefrAssessment: "Оценка CEFR",
            cefrAssessmentDesc: "Чтение • Аудирование • Письмо",
            account: "Аккаунт",
            profileDesc: "Ваш личный профиль",
            loginDesc: "Вход в аккаунт",
            registerDesc: "Создание нового аккаунта"
        },

        en: {
            voiceTitle: "Voice chat",
            voiceListening: "I'm listening...",
            voiceSpeaking: "Teacher Hasan is responding...",
            voiceIdle: "Tap the microphone to start speaking",
            chatEmpty: "Your conversation will appear here",
            you: "You",
            teacher: "Teacher Hasan",
            statusReady: "Ready. Tap the microphone to start.",
            statusListening: "Teacher Hasan is listening...",
            statusStopped: "Conversation stopped. Tap the microphone to continue.",
            remembered: "I remember your previous lesson. Let's continue.",

            login: "Login",
            register: "Register",
            profile: "Profile",
            logout: "Logout",
            language: "Language",
            teacherHasan: "Teacher Hasan AI",
            personalTeacher: "Your personal AI Language Teacher",
            liveAI: "✨ Teacher Hasan live AI",
            ready: "⚪ Ready. Press Start.",
            start: "Start",
            stop: "Stop",

            main: "Main",
            home: "Home",
            speakingExam: "Speaking Exam",
            speakingExamDesc: "CEFR Speaking exam",
            videoLessons: "Video Lessons",
            videoLessonsDesc: "CEFR skill videos",
            englishPractice: "English Practice",
            englishPracticeDesc: "Vocabulary and tests",
            cefrAssessment: "CEFR Assessment",
            cefrAssessmentDesc: "Reading • Listening • Writing",
            account: "Account",
            profileDesc: "Your personal profile",
            loginDesc: "Sign in to your account",
            registerDesc: "Create a new account"
        }
    };

    function getLanguage() {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (
            saved &&
            Object.prototype.hasOwnProperty.call(
                translations,
                saved
            )
        ) {
            return saved;
        }

        return "uz";
    }

    function setLanguage(lang) {
        if (
            !Object.prototype.hasOwnProperty.call(
                translations,
                lang
            )
        ) {
            return;
        }

        localStorage.setItem(STORAGE_KEY, lang);

        document.documentElement.lang = lang;

        window.dispatchEvent(
            new CustomEvent("teacherHasanLanguageChanged", {
                detail: { lang }
            })
        );
    }

    function t(key) {
        const lang = getLanguage();

        return (
            translations[lang]?.[key] ??
            translations.uz?.[key] ??
            key
        );
    }

    window.TeacherHasanI18n = {
        translations,
        getLanguage,
        setLanguage,
        t
    };
})();
