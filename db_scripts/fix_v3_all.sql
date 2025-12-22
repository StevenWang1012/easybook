-- ==========================================
-- EasyBook V3.0 核心修復腳本 (Fix Pack)
-- 目標：解決 RLS 寫入權限死結，全面改用 RPC 處理寫入
-- ==========================================

-- 1. 清理與重置 RLS (保留讀取權限，移除寫入權限，強制走 RPC)
-- ---------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- 移除舊的 INSERT/UPDATE/DELETE policies (避免干擾)
DROP POLICY IF EXISTS "Enable insert for customers" ON public.customers;
DROP POLICY IF EXISTS "Enable insert for bookings" ON public.bookings;
DROP POLICY IF EXISTS "Owners can insert staff" ON public.staff;
DROP POLICY IF EXISTS "Owners can update staff" ON public.staff;
DROP POLICY IF EXISTS "Owners can delete staff" ON public.staff;
DROP POLICY IF EXISTS "Owners can insert services" ON public.services;
DROP POLICY IF EXISTS "Owners can update services" ON public.services;
DROP POLICY IF EXISTS "Owners can delete services" ON public.services;

-- 確保 SELECT 策略存在 (先移除舊的以確保設定正確且不報錯)
DROP POLICY IF EXISTS "Public read services" ON public.services;
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read staff" ON public.staff;
CREATE POLICY "Public read staff" ON public.staff FOR SELECT USING (true);

-- 2. 解決 Bug 1: 客戶預約 RPC (原子操作：歸戶 + 預約)
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public_submit_booking(
    p_store_id uuid,
    p_name text,
    p_phone text,
    p_line_uid text,
    p_booking_date date,
    p_booking_time text,
    p_service_name text,
    p_staff_name text,
    p_device_info text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- 上帝模式：無視 RLS
AS $$
DECLARE
    v_customer_id uuid;
    v_is_blacklisted boolean;
BEGIN
    -- A. 檢查黑名單
    SELECT is_blacklisted INTO v_is_blacklisted
    FROM public.customers
    WHERE store_id = p_store_id AND phone = p_phone;

    IF v_is_blacklisted THEN
        RAISE EXCEPTION 'Blacklisted customer';
    END IF;

    -- B. 客戶歸戶 (Upsert)
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE store_id = p_store_id AND phone = p_phone;

    IF v_customer_id IS NOT NULL THEN
        -- 更新現有客戶資料 (若有 LINE 資料)
        UPDATE public.customers
        SET 
            line_uid = COALESCE(p_line_uid, line_uid),
            name = COALESCE(p_name, name) -- 更新最新稱呼
        WHERE id = v_customer_id;
    ELSE
        -- 新增客戶
        INSERT INTO public.customers (store_id, name, phone, line_uid)
        VALUES (p_store_id, p_name, p_phone, p_line_uid)
        RETURNING id INTO v_customer_id;
    END IF;

    -- C. 寫入預約
    INSERT INTO public.bookings (
        store_id, customer_id, customer_name, customer_phone,
        service_name, staff_name, booking_date, booking_time,
        status, device_info
    )
    VALUES (
        p_store_id, v_customer_id, p_name, p_phone,
        p_service_name, p_staff_name, p_booking_date, p_booking_time,
        'confirmed', p_device_info
    );

    RETURN v_customer_id;
END;
$$;

-- 3. 解決 Bug 2: 店長管理功能 RPC (Staff / Services)
-- ---------------------------------------------------

-- 3.1 驗證店長身分的輔助函數
CREATE OR REPLACE FUNCTION check_is_owner(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.stores 
        WHERE id = p_store_id AND owner_id = auth.uid()
    );
END;
$$;

-- 3.2 人員管理 (新增/修改/刪除)
CREATE OR REPLACE FUNCTION owner_manage_staff(
    p_action text, -- 'create', 'update', 'delete'
    p_store_id uuid,
    p_staff_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_title text DEFAULT NULL,
    p_avatar text DEFAULT NULL,
    p_login_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 安全檢查
    IF NOT check_is_owner(p_store_id) THEN
        RAISE EXCEPTION 'Permission Denied: Not Store Owner';
    END IF;

    IF p_action = 'create' THEN
        INSERT INTO public.staff (store_id, name, title, avatar, login_code)
        VALUES (p_store_id, p_name, p_title, p_avatar, p_login_code);
    ELSIF p_action = 'update' THEN
        UPDATE public.staff
        SET name = p_name, title = p_title, avatar = p_avatar, login_code = p_login_code
        WHERE id = p_staff_id AND store_id = p_store_id;
    ELSIF p_action = 'delete' THEN
        UPDATE public.staff SET deleted_at = now() -- 軟刪除
        WHERE id = p_staff_id AND store_id = p_store_id;
    END IF;
END;
$$;

-- 3.3 課程管理 (新增/修改/刪除)
CREATE OR REPLACE FUNCTION owner_manage_service(
    p_action text,
    p_store_id uuid,
    p_service_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_price int DEFAULT NULL,
    p_duration int DEFAULT NULL,
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT check_is_owner(p_store_id) THEN
        RAISE EXCEPTION 'Permission Denied: Not Store Owner';
    END IF;

    IF p_action = 'create' THEN
        INSERT INTO public.services (store_id, name, price, duration, description)
        VALUES (p_store_id, p_name, p_price, p_duration, p_description);
    ELSIF p_action = 'update' THEN
        UPDATE public.services
        SET name = p_name, price = p_price, duration = p_duration, description = p_description
        WHERE id = p_service_id AND store_id = p_store_id;
    ELSIF p_action = 'delete' THEN
        UPDATE public.services SET deleted_at = now()
        WHERE id = p_service_id AND store_id = p_store_id;
    END IF;
END;
$$;

-- 3.4 訂單狀態管理 (取消/封鎖)
CREATE OR REPLACE FUNCTION owner_update_booking(
    p_store_id uuid,
    p_booking_id uuid,
    p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT check_is_owner(p_store_id) THEN
        RAISE EXCEPTION 'Permission Denied';
    END IF;

    UPDATE public.bookings
    SET status = p_new_status
    WHERE id = p_booking_id AND store_id = p_store_id;
END;
$$;

-- 3.5 排休管理 (批量寫入)
CREATE OR REPLACE FUNCTION owner_batch_block_time(
    p_store_id uuid,
    p_payload jsonb -- Array of objects
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
BEGIN
    IF NOT check_is_owner(p_store_id) THEN
        RAISE EXCEPTION 'Permission Denied';
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(p_payload)
    LOOP
        INSERT INTO public.bookings (
            store_id, staff_name, booking_date, booking_time, 
            status, customer_name, service_name
        ) VALUES (
            p_store_id, item->>'staff_name', (item->>'booking_date')::date, item->>'booking_time',
            'blocked', item->>'reason', '排休/公休'
        );
    END LOOP;
END;
$$;

-- 4. 解決 Bug 3: SuperAdmin 編輯商家 RPC
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION super_admin_update_store(
    p_store_id uuid,
    p_name text,
    p_valid_until date,
    p_plan_price int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 檢查是否為平台管理員
    IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = auth.uid()) THEN
        RAISE EXCEPTION 'Permission Denied: Not Super Admin';
    END IF;

    UPDATE public.stores
    SET 
        name = p_name,
        valid_until = p_valid_until,
        plan_price = p_plan_price
    WHERE id = p_store_id;
END;
$$;

-- 5. 賦予執行權限
-- ---------------------------------------------------
GRANT EXECUTE ON FUNCTION public_submit_booking TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION owner_manage_staff TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION owner_manage_service TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION owner_update_booking TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION owner_batch_block_time TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION super_admin_update_store TO authenticated, service_role;