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
    music: "Music"
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
    music: "الموسيقى"
  }
};

export function t(locale: Locale, key: string): string {
  return dict[locale][key] ?? key;
}
