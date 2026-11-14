/**
 * Default UI strings (docs/PROJECT_SPEC.md §4.5), seeded into the `ui_strings`
 * table by `pnpm db:seed`. Code must reference keys only — never these values
 * directly — so admins can edit copy without a deploy. This file is the seed
 * source, not a runtime lookup table.
 *
 * Grows as each milestone's UI is built. Milestone 1: auth, settings,
 * RBAC/staff, media, locations, audit, and common admin-shell chrome.
 */
export interface UiStringDefault {
  key: string;
  bn: string;
  en: string;
}

export const UI_STRING_DEFAULTS: UiStringDefault[] = [
  // Common actions
  { key: "common.save", bn: "সংরক্ষণ করুন", en: "Save" },
  { key: "common.cancel", bn: "বাতিল", en: "Cancel" },
  { key: "common.delete", bn: "মুছে ফেলুন", en: "Delete" },
  { key: "common.edit", bn: "সম্পাদনা", en: "Edit" },
  { key: "common.create", bn: "তৈরি করুন", en: "Create" },
  { key: "common.search", bn: "খুঁজুন", en: "Search" },
  { key: "common.loading", bn: "লোড হচ্ছে…", en: "Loading…" },
  { key: "common.confirm", bn: "নিশ্চিত করুন", en: "Confirm" },
  { key: "common.back", bn: "পেছনে", en: "Back" },
  { key: "common.next", bn: "পরবর্তী", en: "Next" },
  { key: "common.finish", bn: "সম্পন্ন করুন", en: "Finish" },
  { key: "common.enabled", bn: "সক্রিয়", en: "Enabled" },
  { key: "common.disabled", bn: "নিষ্ক্রিয়", en: "Disabled" },

  // Auth
  { key: "auth.login.title", bn: "লগইন করুন", en: "Log in" },
  { key: "auth.login.email", bn: "ইমেইল", en: "Email" },
  { key: "auth.login.password", bn: "পাসওয়ার্ড", en: "Password" },
  { key: "auth.login.submit", bn: "লগইন", en: "Log in" },
  { key: "auth.login.invalidCredentials", bn: "ইমেইল বা পাসওয়ার্ড সঠিক নয়", en: "Incorrect email or password" },
  { key: "auth.login.accountDisabled", bn: "এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে", en: "This account has been disabled" },
  { key: "auth.totp.title", bn: "দুই-ধাপ যাচাইকরণ", en: "Two-factor verification" },
  { key: "auth.totp.prompt", bn: "আপনার অ্যাপ থেকে ৬-সংখ্যার কোড লিখুন", en: "Enter the 6-digit code from your app" },
  { key: "auth.totp.invalidCode", bn: "কোডটি সঠিক নয়", en: "That code isn't right" },
  { key: "auth.totp.setupTitle", bn: "দুই-ধাপ যাচাইকরণ চালু করুন", en: "Set up two-factor authentication" },
  { key: "auth.totp.setupPrompt", bn: "QR কোডটি আপনার অথেনটিকেটর অ্যাপে স্ক্যান করুন", en: "Scan the QR code with your authenticator app" },
  { key: "auth.logout", bn: "লগআউট", en: "Log out" },
  { key: "auth.forbidden", bn: "এই কাজটি করার অনুমতি আপনার নেই", en: "You don't have permission to do that" },

  // Setup wizard
  { key: "setup.welcome.title", bn: "স্বাগতম", en: "Welcome" },
  { key: "setup.superAdmin.title", bn: "সুপার অ্যাডমিন তৈরি করুন", en: "Create the Super Admin" },
  { key: "setup.brand.title", bn: "ব্র্যান্ডের তথ্য", en: "Brand basics" },
  { key: "setup.theme.title", bn: "থিম নির্বাচন করুন", en: "Choose a theme" },
  { key: "setup.done.title", bn: "সেটআপ সম্পন্ন হয়েছে", en: "Setup complete" },

  // Settings
  { key: "settings.title", bn: "সেটিংস", en: "Settings" },
  { key: "settings.saved", bn: "সেটিংস সংরক্ষিত হয়েছে", en: "Settings saved" },
  { key: "settings.group.brand", bn: "ব্র্যান্ড", en: "Brand" },
  { key: "settings.group.locale", bn: "ভাষা ও লোকেল", en: "Language & locale" },
  { key: "settings.group.theme", bn: "থিম", en: "Theme" },
  { key: "settings.group.security", bn: "সুরক্ষা", en: "Security" },
  { key: "settings.group.features", bn: "ফিচার", en: "Features" },
  { key: "settings.secret.replace", bn: "পরিবর্তন করুন", en: "Replace" },
  { key: "settings.secret.testConnection", bn: "সংযোগ পরীক্ষা করুন", en: "Test connection" },

  // Staff / roles / RBAC
  { key: "staff.title", bn: "স্টাফ", en: "Staff" },
  { key: "staff.roles.title", bn: "রোল", en: "Roles" },
  { key: "staff.roles.permissions", bn: "অনুমতিসমূহ", en: "Permissions" },
  { key: "staff.status.active", bn: "সক্রিয়", en: "Active" },
  { key: "staff.status.disabled", bn: "নিষ্ক্রিয়", en: "Disabled" },

  // Media
  { key: "media.title", bn: "মিডিয়া লাইব্রেরি", en: "Media library" },
  { key: "media.upload", bn: "আপলোড করুন", en: "Upload" },
  { key: "media.folders", bn: "ফোল্ডার", en: "Folders" },
  { key: "media.usage.none", bn: "এখনও কোথাও ব্যবহৃত হয়নি", en: "Not used anywhere yet" },

  // Locations
  { key: "locations.title", bn: "এলাকাসমূহ", en: "Locations" },
  { key: "locations.divisions", bn: "বিভাগ", en: "Divisions" },
  { key: "locations.districts", bn: "জেলা", en: "Districts" },
  { key: "locations.areas", bn: "এলাকা", en: "Areas" },

  // Audit log
  { key: "audit.title", bn: "অডিট লগ", en: "Audit log" },
  { key: "audit.noChanges", bn: "কোনো পরিবর্তন রেকর্ড করা হয়নি", en: "No changes recorded" },

  // Integrations / providers
  { key: "integrations.title", bn: "ইন্টিগ্রেশন", en: "Integrations" },
  { key: "integrations.testConnection.success", bn: "সংযোগ সফল হয়েছে", en: "Connection succeeded" },
  { key: "integrations.testConnection.failure", bn: "সংযোগ ব্যর্থ হয়েছে", en: "Connection failed" },

  // Admin shell
  { key: "shell.search.placeholder", bn: "খুঁজুন বা একটি কমান্ড চালান…", en: "Search or run a command…" },
  { key: "shell.nav.dashboard", bn: "ড্যাশবোর্ড", en: "Dashboard" },

  // Storefront header & footer. Every key under `storefront.` is public — served to the
  // storefront by `GET /store/ui-strings` and editable via the admin UI-strings API.
  { key: "storefront.header.menu", bn: "মেনু", en: "Menu" },
  { key: "storefront.header.closeMenu", bn: "মেনু বন্ধ করুন", en: "Close menu" },
  { key: "storefront.header.search", bn: "খুঁজুন", en: "Search" },
  { key: "storefront.header.searchPlaceholder", bn: "প্রোডাক্ট খুঁজুন…", en: "Search products…" },
  { key: "storefront.header.account", bn: "অ্যাকাউন্ট", en: "Account" },
  { key: "storefront.header.wishlist", bn: "উইশলিস্ট", en: "Wishlist" },
  { key: "storefront.header.cart", bn: "কার্ট", en: "Cart" },
  { key: "storefront.header.trackOrder", bn: "অর্ডার ট্র্যাক করুন", en: "Track order" },
  // Label of the language switch: names the language it switches *to*.
  { key: "storefront.header.otherLanguage", bn: "English", en: "বাংলা" },
  { key: "storefront.header.showSubmenu", bn: "সাবমেনু দেখান", en: "Show submenu" },
  { key: "storefront.header.searchByPhoto", bn: "ছবি দিয়ে খুঁজুন", en: "Search by photo" },
  { key: "storefront.footer.contact", bn: "যোগাযোগ", en: "Contact" },
];
