-- ==========================================
-- EasyBook Storage 權限修復腳本
-- 解決: 上傳圖片時出現 "new row violates row-level security policy"
-- ==========================================

-- 1. 建立 avatars Bucket (如果不存在)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. 移除舊的 Policy (避免衝突)
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Give me uploads" ON storage.objects; -- 常見的舊名稱

-- 3. 新增 Policy: 允許 "已登入用戶 (authenticated)" 上傳檔案
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatars' );

-- 4. 新增 Policy: 允許 "已登入用戶" 更新檔案
CREATE POLICY "Allow authenticated updates"
ON storage.objects
FOR UPDATE
TO authenticated
USING ( bucket_id = 'avatars' );

-- 5. 新增 Policy: 允許 "所有人 (public)" 讀取/下載檔案
CREATE POLICY "Allow public read"
ON storage.objects
FOR SELECT
TO public
USING ( bucket_id = 'avatars' );

-- 6. 確保刪除權限 (如果需要刪除舊圖)
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
CREATE POLICY "Allow authenticated deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING ( bucket_id = 'avatars' );