# CampaignFlow — طلبات الحملات الإعلانية

Next.js 16 / React / TypeScript / Supabase / Node.js 22 / Vercel.

الواجهة العامة: `/` و`/request`. أربعة حقول إلزامية فقط، دون حساب مستخدم أو دفع.
لوحة المدير: `/admin/login` ثم `/admin/dashboard` و`/admin/orders` وتفاصيل الطلب.

## التشغيل

1. `npm ci`
2. احتفظ بملف `.env.local` الحالي. استخدم `.env.example` كمرجع للمتغيرات فقط.
3. طبّق الترحيل الجديد وفق [SIMPLIFICATION_REPORT.md](SIMPLIFICATION_REPORT.md)، ثم `npm run dev`.

لا تعِد تشغيل ترحيل core على قاعدة قائمة، ولا تعِد إنشاء المدير.

## التحقق

`npm run typecheck`، `npm run lint`، `npm test`، `npm run build`، `npm run test:e2e`، `npm run test:workflow`.
اختبارات workflow تستخدم خادماً محلياً يحاكي Supabase مع PostgreSQL عبر PGlite، وحساب اختبار مستقل تماماً عن الإنتاج.

## حفظ التاريخ

الجدول `ad_requests` مستقل. تعرض الإدارة الطلبات القديمة والجديدة وتحتسبها معاً. الحقول الجديدة للسجلات القديمة تبقى فارغة بدلاً من تخمين بياناتها. تعرض صفحة التفاصيل البيانات الأصلية القديمة للمدير فقط.
المسارات القديمة مؤرشفة بامتداد `.archive` داخل `archive/legacy-routes` وخارج نظام التوجيه. بقيت دوال الخلفية التاريخية واختباراتها محفوظة؛ لا يستدعيها تدفق الطلب الجديد.
لا توجد مهام cron لإرسال واتساب. بقي webhook موقّع لاستقبال حالات الرسائل التاريخية فقط.
