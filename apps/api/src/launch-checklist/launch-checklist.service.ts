import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

export interface LaunchChecklistItem {
  key: string;
  label: { bn: string; en: string };
  /** `true` once the item is satisfied, computed from real system state wherever one exists. */
  done: boolean;
  /** `true` when nothing short of the owner acting outside the admin panel (real credentials, written policy text, a Search Console visit) can flip this — the §16 M9 acceptance line ("shows only owner-side items ... as pending"). */
  ownerAction: boolean;
  detail: { bn: string; en: string };
}

const BACKUP_FRESHNESS_HOURS = 48;

/**
 * §16 M9 "launch checklist page in admin (policies filled, payment live,
 * courier live, SMS live, tracking verified, sitemap submitted, backups
 * running, staff 2FA)". Every item is computed from real rows wherever
 * one exists — nothing here is a plain admin-ticked checkbox except
 * "sitemap submitted" (no system signal for that one exists, see
 * `ops.sitemapSubmitted`) and "backups running" (reported by the external
 * backup job itself, see `/public/cron/backup-heartbeat`).
 */
@Injectable()
export class LaunchChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async compute(): Promise<LaunchChecklistItem[]> {
    const [pagesNeedingContent, payment, courier, sms, tracking, trackingSent, dormantStaffCount, lastBackupAt, sitemapSubmitted] = await Promise.all([
      this.prisma.page.count({ where: { needsContent: true, deletedAt: null } }),
      this.hasRealProvider("payment"),
      this.hasRealProvider("courier"),
      this.hasRealProvider("sms"),
      this.hasRealProvider("tracking"),
      this.prisma.trackingEventLog.count({ where: { status: "sent" } }),
      this.prisma.staffUser.count({ where: { status: "active", deletedAt: null, totpEnabled: false } }),
      this.settings.getValue<string | null>("ops.lastBackupAt"),
      this.settings.getValue<boolean>("ops.sitemapSubmitted"),
    ]);

    const backupFresh = lastBackupAt !== null && Date.now() - new Date(lastBackupAt).getTime() < BACKUP_FRESHNESS_HOURS * 60 * 60 * 1000;

    return [
      {
        key: "policies_filled",
        label: { bn: "পলিসি পেজ লেখা হয়েছে", en: "Policy pages are filled in" },
        done: pagesNeedingContent === 0,
        ownerAction: true,
        detail:
          pagesNeedingContent === 0
            ? { bn: "সব পলিসি পেজে কনটেন্ট আছে।", en: "Every policy page has real content." }
            : { bn: `${pagesNeedingContent}টি পেজে এখনও কনটেন্ট দরকার।`, en: `${pagesNeedingContent} page(s) still need real content.` },
      },
      {
        key: "payment_live",
        label: { bn: "লাইভ পেমেন্ট গেটওয়ে সক্রিয়", en: "A live payment gateway is enabled" },
        done: payment,
        ownerAction: true,
        detail: payment
          ? { bn: "একটি রিয়েল পেমেন্ট গেটওয়ে সক্রিয় আছে।", en: "A real (non-mock) payment provider is enabled." }
          : { bn: "শুধু COD/মক গেটওয়ে সক্রিয় — একটি রিয়েল গেটওয়ে কনফিগার করুন।", en: "Only COD/the mock gateway is enabled — configure a real one." },
      },
      {
        key: "courier_live",
        label: { bn: "লাইভ কুরিয়ার সক্রিয়", en: "A live courier is enabled" },
        done: courier,
        ownerAction: true,
        detail: courier
          ? { bn: "একটি রিয়েল কুরিয়ার সক্রিয় আছে।", en: "A real (non-mock) courier provider is enabled." }
          : { bn: "শুধু ম্যানুয়াল/মক কুরিয়ার সক্রিয় — একটি রিয়েল কুরিয়ার কনফিগার করুন।", en: "Only manual/the mock courier is enabled — configure a real one." },
      },
      {
        key: "sms_live",
        label: { bn: "লাইভ SMS গেটওয়ে সক্রিয়", en: "A live SMS gateway is enabled" },
        done: sms,
        ownerAction: true,
        detail: sms
          ? { bn: "একটি রিয়েল SMS গেটওয়ে সক্রিয় আছে।", en: "A real (non-mock) SMS provider is enabled." }
          : { bn: "শুধু মক SMS সক্রিয় — একটি রিয়েল গেটওয়ে কনফিগার করুন।", en: "Only the mock SMS driver is enabled — configure a real one." },
      },
      {
        key: "tracking_verified",
        label: { bn: "ট্র্যাকিং যাচাই করা হয়েছে", en: "Tracking is configured and verified" },
        done: tracking && trackingSent > 0,
        ownerAction: true,
        detail:
          tracking && trackingSent > 0
            ? { bn: "একটি রিয়েল ট্র্যাকিং পিক্সেল সক্রিয় এবং অন্তত একটি ইভেন্ট পাঠানো হয়েছে।", en: "A real tracking pixel is enabled and at least one event has sent successfully." }
            : { bn: "একটি রিয়েল পিক্সেল আইডি কনফিগার করুন, তারপর একটি টেস্ট অর্ডার দিয়ে যাচাই করুন।", en: "Configure a real pixel id, then verify with a test order." },
      },
      {
        key: "backups_running",
        label: { bn: "ব্যাকআপ চলছে", en: "Backups are running" },
        done: backupFresh,
        ownerAction: true,
        detail: backupFresh
          ? { bn: `সর্বশেষ ব্যাকআপ: ${lastBackupAt}`, en: `Last backup: ${lastBackupAt}` }
          : { bn: "বিগত ৪৮ ঘণ্টায় কোনো সফল ব্যাকআপ রিপোর্ট হয়নি — external cron/sidecar কনফিগার করুন।", en: "No successful backup reported in the last 48 hours — set up the external cron or sidecar (§15.4)." },
      },
      {
        key: "staff_2fa",
        label: { bn: "সব স্টাফের 2FA চালু", en: "Every staff account has 2FA enabled" },
        done: dormantStaffCount === 0,
        ownerAction: false,
        detail:
          dormantStaffCount === 0
            ? { bn: "সব সক্রিয় স্টাফ অ্যাকাউন্টে 2FA চালু আছে।", en: "Every active staff account has 2FA enabled." }
            : { bn: `${dormantStaffCount} জন স্টাফ এখনও প্রথমবার লগইন করে 2FA সেটআপ করেননি।`, en: `${dormantStaffCount} staff account(s) haven't logged in to set up 2FA yet (enforced on their next login).` },
      },
      {
        key: "sitemap_submitted",
        label: { bn: "সার্চ ইঞ্জিনে সাইটম্যাপ জমা দেওয়া হয়েছে", en: "Sitemap submitted to search engines" },
        done: sitemapSubmitted,
        ownerAction: true,
        detail: sitemapSubmitted
          ? { bn: "চিহ্নিত করা হয়েছে।", en: "Marked as done." }
          : { bn: "Google/Bing Search Console-এ sitemap.xml জমা দিয়ে এখানে চিহ্নিত করুন।", en: "Submit sitemap.xml to Google/Bing Search Console, then mark it done here." },
      },
    ];
  }

  private async hasRealProvider(capability: string): Promise<boolean> {
    const count = await this.prisma.providerInstance.count({ where: { capability, enabled: true, driver: { not: "mock" } } });
    return count > 0;
  }
}
