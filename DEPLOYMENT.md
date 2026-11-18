# نشر النظام المبسط

- استخدم Node.js 22 وVercel؛ أمر البناء `npm run build`.
- احتفظ بقيم Supabase الموجودة وحساب المدير الحالي.
- المتغيرات المطلوبة: `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` و`SUPABASE_SERVICE_ROLE_KEY` و`APP_URL`.
- اجعل `APP_URL` مطابقاً لأصل الموقع الفعلي تماماً، ويشمل البروتوكول والمنفذ محلياً. لا تسمح لموقع preview باستخدام أصل الإنتاج خطأً.
- طبّق فقط `supabase/migrations/202611180002_simple_requests.sql` على القاعدة الموجودة، قبل نشر الكود الجديد. الترحيل داخل معاملة واحدة ولا يحذف أو يغير صفوف التاريخ.
- لا تشغّل `admin:create` ولا سكربت reset لإعداد النسخة الجديدة؛ المدير موجود بالفعل.
- احتفظ بالمتغيرات التاريخية `ORDER_TOKEN_SECRET` و`CRON_SECRET` وكل `WHATSAPP_*` و`META_APP_SECRET` حتى إن لم تعد مطلوبة لتقديم الطلبات.
- `META_APP_SECRET` و`WHATSAPP_VERIFY_TOKEN` يخصان webhook التاريخي المحفوظ؛ إرسال الطلبات مستقل عن Meta.
- أزيلت مهمة cron من `vercel.json`، وأزيل مسار تشغيل الإشعارات. أي تشغيل خارجي قديم لذلك المسار سيحصل على 404.
- أعد فحص تسجيل دخول المدير وتقديم طلب فعلي بعد تطبيق الترحيل والنشر.

تفاصيل التحقق وخطوات Supabase في `SIMPLIFICATION_REPORT.md`.
