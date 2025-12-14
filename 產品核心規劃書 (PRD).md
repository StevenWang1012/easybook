# 個人工作室預約系統 - 產品核心規劃書 (PRD)

**版本：** v2.0 (MVP 實作完成版 - 含前後台邏輯與 DB 現況)
**專案代號：** EasyBook / Amber Flow
**技術架構：** No-Build (HTML + Tailwind CDN + React CDN + Babel Standalone)
**資料庫：** Supabase

## 1. 商業核心與現況 (Status)

| 關鍵面向     | 內容 |
| ----       | --- |
| **目標客群** | 個人工作室（以 Amber Flow 瑜珈/皮拉提斯為範本）。 |
| **目前進度** | **MVP 已完成**。具備完整前台預約、後台管理、排班、營收統計功能。 |
| **部署方式** | GitHub Pages (靜態託管) + Supabase (雲端資料庫)。 |
| **檔案結構** | 1. `index.html` (前台完整邏輯)

2. `admin.html` (後台骨架)

3. `admin.js` (後台 React 邏輯核心) |

## 2. 系統架構地圖 (Sitemap & Features)

### C 端 - 客戶預約前台 (`index.html`)

**核心邏輯：** 漸進式載入 (Progressive Loading)、動態時段計算 (30分鐘一格)。

| 區塊 | 功能細節 | 狀態 |
| --- | --- | --- |
| **首頁 Header** | 1. **跑馬燈 (Marquee)：** 顯示 `storeInfo.description`，載入後延遲 1 秒滾動。

2. **資訊按鈕 (Info Modal)：** 彈出預約須知 (`storeInfo.terms`)。

3. **地點顯示：** 連動 Google Maps Icon。 | ✅ 完成 |
| **預約流程** | 1. **選擇服務：** 自動過濾已刪除 (`deleted_at`) 的項目。

2. **選擇人員：** 自動過濾已離職人員。

3. **選擇時間：** 

   - 日期選擇器。

   - **動態時段 (08:00-21:00)**。

   - **即時狀態檢查**：自動鎖定已預約 (`confirmed`) 或教練排休 (`blocked`) 的時段。 | ✅ 完成 |
| **資料填寫** | 1. **手機防呆：** 強制 `09` 開頭，限制輸入 8 碼數字。

2. **送出防重：** 按鈕 Loading 狀態防止重複點擊。 | ✅ 完成 |
| **開發模式** | 右下角懸浮按鈕，快速跳轉至 `admin.html`。 | ✅ 完成 |

### B 端 - 商家後台 (`admin.html` + `admin.js`)

**核心邏輯：** React Components 分離、權限控管 (模擬)、軟刪除機制。

| 模組 | 功能細節 | 狀態 |
| --- | --- | --- |
| **登入頁** | 模擬登入 (admin/1234)，阻擋未授權訪問。 | ✅ 完成 |
| **1. 儀表板** | 1. **數據卡片：** 有效訂單數、預估營收 (排除取消/休假單)。

2. **訂單列表：** 即時顯示最新預約。

3. **狀態操作：** 可將訂單標記為「完成」或「取消」。 | ✅ 完成 |
| **2. 排班管理** | 1. **日曆視圖：** 選擇日期/人員，點擊格子快速切換「休假/空閒」。

2. **批量請假 (Batch Leave)：** 設定開始/結束時間與原因，批次寫入資料庫。

3. **本月甘特圖 (Gantt)：** 底部總覽表，紅字「休」/ 綠點「●」顯示整月狀況。

4. **防呆：** 若時段已有客戶預約，禁止直接設為休假。 | ✅ 完成 |
| **3. 課程管理** | 1. **CRUD：** 新增、編輯、刪除課程。

2. **軟刪除 (Soft Delete)：** 若刪除時發現有未來訂單，自動轉為軟刪除 (標記 `deleted_at`)。 | ✅ 完成 |
| **4. 人員管理** | 1. **CRUD：** 新增、編輯、刪除人員。

2. **圖片上傳：** 整合 Supabase Storage (`avatars` bucket)。

3. **同步刪除：** 硬刪除人員時，自動刪除 Storage 中的圖片檔案。 | ✅ 完成 |
| **5. 商店設定** | 1. **文案管理：** 編輯店名、地址、LINE 連結。

2. **公告管理：** 編輯首頁跑馬燈 (`description`) 與 預約須知 (`terms`)。 | ✅ 完成 |

## 3. 資料庫核心架構 (Supabase Schema)

目前已實作的資料表結構與關鍵欄位。

### 1. `stores` (商家設定)

| 欄位名 | 類型 | 備註 |
| --- | --- | --- |
| `id` | UUID | PK |
| `name` | Text | 店名 |
| `address` | Text | 地址 (新增) |
| `line_url` | Text | LINE 連結 (新增) |
| `description` | Text | 首頁跑馬燈文案 (新增) |
| `terms` | Text | 預約須知文案 (新增) |

### 2. `services` (服務項目)

| 欄位名 | 類型 | 備註 |
| --- | --- | --- |
| `id` | UUID | PK |
| `name` | Text | 服務名稱 |
| `price` | Int | 價格 |
| `duration` | Int | 分鐘數 |
| `description` | Text | 描述 |
| `deleted_at` | Timestamp | **軟刪除標記** (若非 NULL 代表已刪除) |

### 3. `staff` (服務人員)

| 欄位名 | 類型 | 備註 |
| --- | --- | --- |
| `id` | UUID | PK |
| `name` | Text | 姓名 |
| `title` | Text | 職稱 |
| `avatar` | Text | 頭像 URL (Supabase Storage) |
| `deleted_at` | Timestamp | **軟刪除標記** |

### 4. `bookings` (預約訂單 & 排休)

| 欄位名 | 類型 | 備註 |
| --- | --- | --- |
| `id` | UUID | PK |
| `booking_date` | Date | 日期 (YYYY-MM-DD) |
| `booking_time` | Text | 時間 (HH:mm) |
| `status` | Varchar | **關鍵狀態：**

- `confirmed`: 客戶預約

- `blocked`: 教練排休/鎖定

- `cancelled`: 已取消

- `completed`: 已完成 |
| `customer_name` | Text | 客戶姓名 (若為 blocked，此欄位存「請假原因」) |
| `customer_phone` | Text | 客戶電話 (完整號碼含09) |

## 4. 待辦與優化清單 (Backlog for Next Sprint)

### 短期優化 (UX/UI)

1. **載入體驗：** 目前首頁載入依賴 `stores` 查詢回傳，若網路慢會有些微延遲，已加上 Loading Spinner。
2. **行動版後台：** `admin.html` 目前在手機上可操作，但甘特圖 (Gantt) 寬度較寬，需左右滑動。

### 長期規劃 (Advanced)

1. **真實 LINE Login：** 取代目前的手填資料。
2. **自動通知機器人：** 需架設 Backend Server (Node.js/Python) 處理 Cron Job。
3. **多店管理：** 目前程式碼寫死抓取 `stores` 第一筆資料，未來可擴充為多店切換。

## 5. 開發環境備註

- **Repository:** GitHub - `easybook`
- **Branch:** `main`
- **Deploy:** GitHub Pages (自動部署)
- **Editor Config:** * VS Code 需安裝 `Live Server` 預覽。
    - Git Commit 時若卡住，請檢查終端機是否等待 User Email 輸入。
    - **推薦使用 Terminal 指令** (`git add .` -> `git commit` -> `git push`) 進行更新。