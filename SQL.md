# EasyBook 資料庫架構與權限總覽 (V3.20 Updated)

本文件整合了 EasyBook 系統運作所需的所有資料庫結構、RLS 策略與 RPC 函數。
**部署說明**：請依照順序在 Supabase SQL Editor 中執行。

## 1. 資料表結構 (Schema)

### 1.1 `stores` (商家設定)

- `id` (uuid, PK): 商家唯一識別碼
- `owner_id` (uuid): 對應 `auth.users` 的管理員 ID
- `name`, `address`, `phone`: 基本資料
- `open_time`, `close_time`: 營業時間 (e.g., '09:00')
- `min_lead_hours` (int): 預約緩衝小時數
- `terms` (text): 預約須知
- `valid_until` (date): 合約到期日 (SaaS 控制用)
- `plan_price`, `discount`: 訂閱方案資訊
- `line_url` (text): LINE 官方帳號連結 (用於加入好友)

### 1.2 `staff` (人員/老師)

- `id` (uuid, PK)
- `store_id` (uuid, FK): 歸屬商家
- `name`, `title`, `avatar`: 顯示資料
- `login_code` (text): 老師登入專用 Passcode
- `deleted_at`: 軟刪除標記

### 1.3 `services` (課程/服務)

- `id` (uuid, PK)
- `store_id` (uuid, FK)
- `name`, `price`, `duration` (mins), `description`
- `deleted_at`: 軟刪除標記

### 1.4 `customers` (客戶資料 CRM)

- `id` (uuid, PK)
- `store_id` (uuid, FK)
- `name`, `phone`, `line_uid`
- `is_blacklisted` (bool): 黑名單狀態
- `notes` (text): **[V3.4 新增]** 物理治療進度/備註 (老師可讀寫)

### 1.5 `bookings` (預約訂單)

- `id` (uuid, PK)
- `store_id` (uuid, FK)
- `customer_id` (uuid, FK)
- `staff_name`, `service_name`: 快照資料 (避免關聯刪除影響)
- `booking_date`, `booking_time`
- `status`: `confirmed` (預約中), `completed` (完成), `cancelled` (取消), `blocked` (排休)

### 1.6 `platform_admins` (平台管理員)

- `id` (uuid, PK): 對應 SuperAdmin 的 `auth.uid`
- `email`: 方便辨識

## 2. 關鍵 RPC 函數 (後端邏輯)

### 2.1 客戶端 (Client)

- **`public_submit_booking`**:
    - 功能：原子操作 (Atomic) 處理「檢查黑名單」+「客戶歸戶(Upsert)」+「寫入訂單」。
    - 權限：`SECURITY DEFINER` (繞過 RLS，允許匿名寫入)。

### 2.2 商家端 (Admin/Owner)

- **`owner_manage_staff` / `owner_manage_service`**:
    - 功能：新增/修改/刪除 人員與課程。
    - 權限：檢查 `auth.uid() == stores.owner_id`。
- **`owner_batch_block_time`**:
    - 功能：批量寫入排休 (Blocked Slots)。
    - 權限：同上，限店長。
- **`owner_update_booking`**:
    - 功能：修改訂單狀態 (取消/完成)。

### 2.3 老師端 (Staff)

- **`staff_update_booking_status`**:
    - 功能：老師核銷訂單。
    - 參數更新：新增 `p_staff_id` 進行雙重驗證。
    - 權限：驗證 `id` + `login_code` 匹配，且僅能修改自己的單。
- **`staff_self_block_time`**:
    - 功能：老師自行排休。
    - 參數更新：新增 `p_staff_id` 進行雙重驗證。
    - 權限：驗證 `id` + `login_code`。
- **`staff_get_store_customers`**: **[V3.4 新增]**
    - 功能：讀取店內客戶列表 (含備註)。
    - 權限：驗證 `store_id` + `login_code`。
- **`staff_update_customer_note`**: **[V3.4 新增]**
    - 功能：更新客戶治療進度備註。
    - 權限：驗證 `login_code`。

### 2.4 平台端 (SuperAdmin)

- **`super_admin_update_store`**:
    - 功能：修改商家合約日期與方案。
    - 權限：檢查 `platform_admins` 表。
- **`get_all_stores_admin`**:
    - 功能：讀取所有商家列表與營收數據。

## 3. 安全性設定 (RLS Policies)

雖然主要寫入依賴 RPC，但讀取 (SELECT) 仍嚴格執行 RLS：

- **`bookings`**: `store_id = current_store_id` (需設定 custom header 或 session 變數，或由 RPC 包裝讀取)。
- **`customers`**: 同上。
- **`storage.objects` (Avatars)**:
    - `SELECT`: Public (所有人可讀)。
    - `INSERT/UPDATE`: Authenticated (僅登入者可上傳)。

## 4. 部署檢查清單 (Deployment Checklist)

1. **初始化**: 執行 `fix_v3_all.sql` 建立核心表與 RPC。
2. **補丁**: 執行 `fix_schema_permissions.sql` 確保 `deleted_at` 與讀取權限。
3. **擴充**: 執行 `add_staff_client_features.sql` 啟用客戶備註功能。
4. **權限**: 執行 `fix_staff_rpc_v2.sql` 修復老師端 ID 驗證漏洞。
5. **Storage**: 執行 `fix_storage_policy.sql` 確保圖片上傳正常。
6. **SuperAdmin**: 手動 Insert 您的 email 到 `platform_admins` 表。