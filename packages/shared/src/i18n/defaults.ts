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
  // Product-card actions: wishlist heart and quick add (size picker sheet).
  { key: "storefront.card.addToWishlist", bn: "উইশলিস্টে যোগ করুন", en: "Add to wishlist" },
  { key: "storefront.card.removeFromWishlist", bn: "উইশলিস্ট থেকে সরান", en: "Remove from wishlist" },
  { key: "storefront.card.quickAdd", bn: "কার্টে যোগ করুন", en: "Add to cart" },
  { key: "storefront.card.preorder", bn: "প্রি-অর্ডার করুন", en: "Preorder" },
  { key: "storefront.card.addedToCart", bn: "কার্টে যোগ হয়েছে", en: "Added to cart" },
  { key: "storefront.card.viewCart", bn: "কার্ট দেখুন", en: "View cart" },
  { key: "storefront.card.viewDetails", bn: "সব বিস্তারিত দেখুন", en: "View full details" },
  { key: "storefront.card.chooseOption", bn: "বেছে নিন", en: "Choose" },
  { key: "storefront.card.outOfStock", bn: "স্টক শেষ", en: "Out of stock" },
  { key: "storefront.card.addFailed", bn: "কার্টে যোগ করা যায়নি, আবার চেষ্টা করুন", en: "Could not add to cart, please try again" },
  { key: "storefront.card.close", bn: "বন্ধ করুন", en: "Close" },
  // Product listing pages: /shop, categories, collections.
  { key: "storefront.listing.allProducts", bn: "সব পণ্য", en: "All products" },
  { key: "storefront.listing.home", bn: "হোম", en: "Home" },
  { key: "storefront.listing.search", bn: "খুঁজুন", en: "Search" },
  { key: "storefront.listing.searchPlaceholder", bn: "পণ্যের নাম লিখে খুঁজুন…", en: "Search products…" },
  { key: "storefront.listing.clearSearch", bn: "সার্চ মুছুন", en: "Clear search" },
  { key: "storefront.listing.filter", bn: "ফিল্টার", en: "Filter" },
  { key: "storefront.listing.filters", bn: "ফিল্টার", en: "Filters" },
  { key: "storefront.listing.sort", bn: "সাজান", en: "Sort" },
  { key: "storefront.listing.sortRelevance", bn: "বাছাই করা", en: "Featured" },
  { key: "storefront.listing.sortBestMatch", bn: "সবচেয়ে মিল", en: "Best match" },
  { key: "storefront.listing.sortNewest", bn: "নতুন আগে", en: "Newest" },
  { key: "storefront.listing.sortBestselling", bn: "বেশি বিক্রি", en: "Best selling" },
  { key: "storefront.listing.sortPriceAsc", bn: "দাম: কম থেকে বেশি", en: "Price: low to high" },
  { key: "storefront.listing.sortPriceDesc", bn: "দাম: বেশি থেকে কম", en: "Price: high to low" },
  { key: "storefront.listing.productCount", bn: "{count}টি পণ্য", en: "{count} products" },
  { key: "storefront.listing.showing", bn: "{total}টির মধ্যে {shown}টি দেখাচ্ছে", en: "Showing {shown} of {total}" },
  { key: "storefront.listing.noResults", bn: "কোনো পণ্য পাওয়া যায়নি", en: "No products found" },
  { key: "storefront.listing.noResultsHint", bn: "অন্য বানানে খুঁজুন বা কিছু ফিল্টার সরিয়ে দেখুন।", en: "Try another spelling or remove some filters." },
  { key: "storefront.listing.clearAll", bn: "সব মুছুন", en: "Clear all" },
  { key: "storefront.listing.apply", bn: "ফলাফল দেখুন", en: "Show results" },
  { key: "storefront.listing.close", bn: "বন্ধ করুন", en: "Close" },
  { key: "storefront.listing.categories", bn: "ক্যাটাগরি", en: "Category" },
  { key: "storefront.listing.price", bn: "দাম (৳)", en: "Price (৳)" },
  { key: "storefront.listing.priceMin", bn: "সর্বনিম্ন", en: "Min" },
  { key: "storefront.listing.priceMax", bn: "সর্বোচ্চ", en: "Max" },
  { key: "storefront.listing.onSale", bn: "শুধু ছাড়ে আছে", en: "On sale" },
  { key: "storefront.listing.inStock", bn: "শুধু স্টকে আছে", en: "In stock" },
  { key: "storefront.listing.loadMore", bn: "আরও দেখুন", en: "Load more" },
  { key: "storefront.listing.loading", bn: "লোড হচ্ছে…", en: "Loading…" },
  { key: "storefront.listing.previousPage", bn: "আগের পেজ", en: "Previous page" },
  { key: "storefront.listing.nextPage", bn: "পরের পেজ", en: "Next page" },
  { key: "storefront.listing.showEarlier", bn: "আগের পণ্যগুলো দেখুন", en: "Show earlier products" },
  { key: "storefront.listing.view", bn: "ভিউ", en: "View" },
  { key: "storefront.listing.viewLarge", bn: "বড় ছবি", en: "Large photos" },
  { key: "storefront.listing.viewGrid", bn: "গ্রিড", en: "Grid" },
  { key: "storefront.listing.viewList", bn: "লিস্ট", en: "List" },
  { key: "storefront.listing.removeFilter", bn: "সরান", en: "Remove" },
  { key: "storefront.listing.showMore", bn: "আরও দেখান", en: "Show more" },
  { key: "storefront.listing.showLess", bn: "কম দেখান", en: "Show less" },
  { key: "storefront.listing.loadFailed", bn: "লোড করা যায়নি, আবার চেষ্টা করুন", en: "Could not load, please try again" },
  // Writing a review: the /review/<link> page and the product page button.
  { key: "storefront.review.writeReview", bn: "রিভিউ লিখুন", en: "Write a review" },
  { key: "storefront.review.pageTitle", bn: "অর্ডার {order_number} এর রিভিউ দিন", en: "Review your order {order_number}" },
  { key: "storefront.review.intro", bn: "আপনার মতামত অন্য ক্রেতাদের সঠিক পণ্য বাছতে সাহায্য করে।", en: "Your review helps other shoppers choose." },
  { key: "storefront.review.rating", bn: "রেটিং", en: "Rating" },
  { key: "storefront.review.fit", bn: "সাইজ কেমন ছিল?", en: "How was the fit?" },
  { key: "storefront.review.fitSmall", bn: "ছোট", en: "Small" },
  { key: "storefront.review.fitTrue", bn: "ঠিকঠাক", en: "True to size" },
  { key: "storefront.review.fitLarge", bn: "বড়", en: "Large" },
  { key: "storefront.review.titlePlaceholder", bn: "এক লাইনে (ঐচ্ছিক)", en: "In one line (optional)" },
  { key: "storefront.review.bodyPlaceholder", bn: "কাপড়, রং, সেলাই, ডেলিভারি কেমন লাগলো?", en: "How were the fabric, colour, stitching and delivery?" },
  { key: "storefront.review.addPhoto", bn: "ছবি যোগ করুন", en: "Add a photo" },
  { key: "storefront.review.uploading", bn: "আপলোড হচ্ছে…", en: "Uploading…" },
  { key: "storefront.review.submit", bn: "রিভিউ জমা দিন", en: "Submit review" },
  { key: "storefront.review.submitting", bn: "জমা হচ্ছে…", en: "Submitting…" },
  { key: "storefront.review.thanks", bn: "ধন্যবাদ! আপনার রিভিউ জমা হয়েছে।", en: "Thank you! Your review was submitted." },
  { key: "storefront.review.alreadyReviewed", bn: "এই পণ্যের রিভিউ দেওয়া হয়েছে", en: "Already reviewed" },
  { key: "storefront.review.notDelivered", bn: "অর্ডার ডেলিভার হওয়ার পর রিভিউ দেওয়া যাবে।", en: "You can review once the order is delivered." },
  { key: "storefront.review.invalidLink", bn: "এই রিভিউ লিংকটি সঠিক নয়।", en: "This review link isn't valid." },
  { key: "storefront.review.allDone", bn: "এই অর্ডারের সব পণ্যের রিভিউ দেওয়া হয়ে গেছে। ধন্যবাদ!", en: "You've reviewed everything in this order. Thank you!" },
  { key: "storefront.review.failed", bn: "জমা দেওয়া যায়নি, আবার চেষ্টা করুন", en: "Could not submit, please try again" },
  { key: "storefront.review.continueShopping", bn: "কেনাকাটা চালিয়ে যান", en: "Continue shopping" },
];
