export type Locale = "en" | "ar";

const dict: Record<Locale, Record<string, string>> = {
  en: {
    myBots: "My Bots",
    admin: "Admin",
    signOut: "Sign out",
    language: "Language",
    activity: "Activity",
    setup: "Setup",
    profile: "Profile",
    presence: "Presence",
    access: "Access",
    subscription: "Subscription",
    music: "Music",
    roomLink: "Room link",
    actionLog: "Action log",
    joinVoice: "Join the assigned voice channel",
    signInDiscord: "Sign in with Discord"
  },
  ar: {
    myBots: "بوتاتي",
    admin: "الإدارة",
    signOut: "تسجيل الخروج",
    language: "اللغة",
    activity: "النشاط",
    setup: "الإعداد",
    profile: "الملف",
    presence: "الحالة",
    access: "الصلاحيات",
    subscription: "الاشتراك",
    music: "الموسيقى",
    roomLink: "رابط الروم",
    actionLog: "سجل الإجراءات",
    joinVoice: "ادخل الروم الصوتي المعيّن",
    signInDiscord: "تسجيل الدخول عبر Discord"
  }
};

export function t(locale: Locale, key: string): string {
  return dict[locale][key] ?? key;
}
