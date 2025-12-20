# EasyBook 資料庫架構與權限總覽 (V3.11)
本文件整合了 EasyBook 系統運作所需的所有資料庫結構、RLS 策略與 RPC 函數。

## 部署說明
請依照順序在 Supabase SQL Editor 中執行以下腳本與配置。

## 1. 資料表結構 (Schema)
### 1.1 stores (商家設定)
| 欄位名稱 | 類型 | 說明 |
|----------|------|------|
| id | uuid (PK) | 商家唯一識別碼 |
| owner_id | uuid | 對應 auth.users 的管理員 ID |
| name | - | 商家名稱 |
| address | - | 商家地址 |
| phone | - | 商家電話 |
| open_time | - | 營業開始時間 (e.g., '09:00') |
| close_time | - | 營業結束時間 (e.g., '21:00') |
| min_lead_hours | int | 預約緩衝小時數 |
| terms | text | 預約須知 |
| valid_until | date | 合約到期日 (SaaS 控制用) |
| plan_price | - | 訂閱方案價格 |
| discount | - | 訂閱方案折扣 |

### 1.2 staff (人員/老師)
| 欄位名稱 | 類型 | 說明 |
|----------|------|------|
| id | uuid (PK) | 人員唯一識別碼 |
| store_id | uuid (FK) | 歸屬商家 ID |
| name | - | 人員姓名 |
| title | - | 人員職稱 |
| avatar | - | 人員頭像 |
| login_code | text | 老師登入專用 Passcode |
| deleted_at | - | 軟刪除標記 |

### 1.3 services (課程/服務)
| 欄位名稱 | 類型 | 說明 |
|----------|------|------|
| id | uuid (PK) | 服務唯一識別碼 |
| store_id | uuid (FK) | 歸屬商家 ID |
| name | - | 服務名稱 |
| price | - | 服務價格 |
| duration | int (mins) | 服務時長（分鐘） |
| description | - | 服務描述 |
| deleted_at | - | 軟刪除標記 |

### 1.4 customers (客戶資料 CRM)
| 欄位名稱 | 類型 | 說明 |
|----------|------|------|
| id | uuid (PK) | 客戶唯一識別碼 |
| store_id | uuid (FK) | 歸屬商家 ID |
| name | - | 客戶姓名 |
| phone | - | 客戶電話 |
| line_uid | - | 客戶 LINE UID |
| is_blacklisted | bool | 黑名單狀態 |
| notes | text | 物理治療進度/備註 |

### 1.5 bookings (預約訂單)
| 欄位名稱 | 類型 | 說明 |
|----------|------|------|
| id | uuid (PK) | 訂單唯一識別碼 |
| store_id | uuid (FK) | 歸屬商家 ID |
| customer_id | uuid (FK) | 對應客戶 ID |
| staff_name | - | 服務人員姓名（快照） |
| service_name | - | 服務名稱（快照） |
| booking_date | - | 預約日期 |
| booking_time | - | 預約時間 |
| status | - | 訂單狀態：confirmed(預約中)、completed(完成)、cancelled(取消)、blocked(排休) |

### 1.6 platform_admins (平台管理員)
| 欄位名稱 | 類型 | 說明 |
|----------|------|------|
| id | uuid (PK) | 對應 SuperAdmin 的 auth.uid |
| email | - | 管理員信箱（方便辨識） |

## 2. 關鍵 RPC 函數 (後端邏輯)
### 2.1 客戶端 (Client)
| 函數名稱 | 功能 | 權限 |
|----------|------|------|
| public_submit_booking | 原子操作處理「檢查黑名單」+「客戶歸戶(Upsert)」+「寫入訂單」 | SECURITY DEFINER（繞過 RLS，允許匿名寫入） |

### 2.2 商家端 (Admin/Owner)
| 函數名稱 | 功能 | 權限 |
|----------|------|------|
| owner_manage_staff | 新增/修改/刪除人員資料 | 檢查 auth.uid() == stores.owner_id |
| owner_manage_service | 新增/修改/刪除課程/服務 | 檢查 auth.uid() == stores.owner_id |
| owner_batch_block_time | 批量寫入排休 (Blocked Slots) | 檢查 auth.uid() == stores.owner_id |
| owner_update_booking | 修改訂單狀態 (取消/完成) | 檢查 auth.uid() == stores.owner_id |

### 2.3 老師端 (Staff)
| 函數名稱 | 功能 | 權限 |
|----------|------|------|
| staff_update_booking_status | 老師核銷訂單 | 驗證 login_code + staff_name 匹配，僅能修改自己的訂單 |
| staff_self_block_time | 老師自行排休 | 驗證 login_code |
| staff_get_store_customers | 讀取店內客戶列表 (含備註) | 驗證 login_code |
| staff_update_customer_note | 更新客戶治療進度備註 | 驗證 login_code |

### 2.4 平台端 (SuperAdmin)
| 函數名稱 | 功能 | 權限 |
|----------|------|------|
| super_admin_update_store | 修改商家合約日期與方案 | 檢查當前使用者是否在 platform_admins 表中 |
| get_all_stores_admin | 讀取所有商家列表與營收數據 | 檢查當前使用者是否在 platform_admins 表中 |

## 3. 安全性設定 (RLS Policies)
雖然主要寫入依賴 RPC，但讀取 (SELECT) 仍嚴格執行 RLS 策略：

| 對象 | RLS 策略說明 |
|------|--------------|
| bookings | SELECT：僅允許讀取 store_id = current_store_id 的數據（需設定 custom header/session 變數，或由 RPC 包裝讀取） |
| customers | SELECT：僅允許讀取 store_id = current_store_id 的數據（規則同上） |
| storage.objects (頭像存儲) | SELECT：Public（所有人可讀）；INSERT/UPDATE：Authenticated（僅登入者可上傳） |

## 4. 部署檢查清單 (Deployment Checklist)
1. **初始化**：執行 `fix_v3_all.sql` 建立核心表與 RPC 函數。
2. **補丁**：執行 `fix_schema_permissions.sql` 確保 deleted_at 欄位與讀取權限配置。
3. **擴充**：執行 `add_staff_client_features.sql` 啟用客戶備註功能。
4. **權限**：執行 `fix_staff_permissions.sql` 確保老師端操作權限正常。
5. **存儲**：執行 `fix_storage_policy.sql` 確保圖片上傳/讀取策略正常。
6. **超級管理員**：手動將 SuperAdmin 的 email 插入 `platform_admins` 表。