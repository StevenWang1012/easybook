-- ==========================================
-- EasyBook 讀取與結構修復腳本
-- 解決：前台讀不到資料、欄位缺失問題
-- ==========================================

-- 1. 確保所有表格都有 deleted_at 欄位 (軟刪除用)
-- 如果缺少此欄位，前端查詢 .is('deleted_at', null) 會直接報錯
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. 強制重設 RLS 讀取策略 (確保 100% 可讀)
-- 先移除舊策略，避免衝突
DROP POLICY IF EXISTS "Public read services" ON public.services;
DROP POLICY IF EXISTS "Public read staff" ON public.staff;
DROP POLICY IF EXISTS "Public read bookings" ON public.bookings; -- 預約通常需權限，但在排錯階段可先確保能讀

-- 建立最寬鬆的讀取策略 (針對 services 與 staff)
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Public read staff" ON public.staff FOR SELECT USING (true);

-- 3. 確保 RPC 擁有者權限正確
ALTER FUNCTION public.owner_manage_service OWNER TO postgres;
ALTER FUNCTION public.owner_manage_staff OWNER TO postgres;
GRANT ALL ON FUNCTION public.owner_manage_service TO public;
GRANT ALL ON FUNCTION public.owner_manage_service TO authenticated;
GRANT ALL ON FUNCTION public.owner_manage_service TO service_role;

-- 4. 驗證 store_id 索引 (加速查詢)
CREATE INDEX IF NOT EXISTS idx_services_store_id ON public.services(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_store_id ON public.staff(store_id);