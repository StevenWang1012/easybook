EasyBook 預約系統 - 產品核心規劃書 (PRD)

版本： v2.5 (5張核心表格版)
更新日期： 2025-12-15
專案狀態： 商業運營準備就緒 (Pre-Launch)

1. 產品核心目標

打造一個專為個人工作室（瑜珈、皮拉提斯、健身、美業）設計的 「極輕量、免安裝、訂閱制」 預約系統。
以 B2B2C 模式運作：

平台方 (Super Admin)：管理店家訂閱與營收。

店家 (Store Admin)：管理課程、人員與排班。

員工 (Staff)：查看個人課表。

消費者 (Customer)：極速預約課程。

2. 技術架構 (Technical Architecture)

2.1 核心架構：No-Build (無伺服器/純前端)

為了極致的部署便利性與低成本，維持 Client-side Rendering (CSR) 架構。

前端核心：HTML5 + React (UMD) + Tailwind CSS + Babel Standalone。

單檔部署：所有邏輯內嵌於 HTML 中，無須 Webpack/Vite 打包，丟上 GitHub Pages 即刻運作。

2.2 後端與資安 (Supabase)

資料庫：PostgreSQL。

身份驗證 (Auth)：

店家與平台管理員：使用 Supabase Auth (Email/Password)，不再使用明碼儲存密碼。

Session：支援 Session Persistence (自動登入)。

資料存取控制 (RLS - Row Level Security)：

嚴格隔離：店家只能讀取 store_id 等於自己 owner_id 的資料。

上帝視角：若使用者 ID 存在於 platform_admins 表格中，則可透過 Policy 讀取所有資料。

公開讀取：僅允許必要的公開資訊 (如店家名稱、課程列表) 開放匿名讀取。

敏感操作防護：

員工登入：使用 Database Function (RPC) check_staff_login 進行後端驗證，避免在前端暴露 login_code。

3. 資料庫結構 (Database Schema)

系統由以下 5 張核心表格 組成。所有表格皆啟用 RLS。

3.1 平台管理員表格 (public.platform_admins) (New!)

紀錄擁有「上帝視角」的超級管理員名單。

欄位名稱

類型

說明

備註

id

uuid

Admin User ID (PK)

對應 auth.users.id (FK)

email

text

管理員 Email

僅供識別參考

role

text

角色權限

預設 super_admin

created_at

timestamptz

建立時間



RLS 策略：所有核心表格 (stores, staff, bookings) 的 Select Policy 需增加檢查：
auth.uid() IN (SELECT id FROM platform_admins)

3.2 商家表格 (public.stores)

紀錄店家的基本資訊、授權狀態與計費設定。

欄位名稱

類型

說明

備註

id

uuid

Store ID (PK)

系統自動生成

name

text

店家名稱



address

text

店家地址



line_url

text

LINE 官方帳號連結



description

text

首頁標語/簡介



terms

text

預約須知/條款



owner_id

uuid

老闆帳號綁定

對應 auth.users.id (FK)

valid_until

date

授權到期日

過期將無法登入後台

plan_price

int2

人頭單價

預設 $300 (SaaS計費)

discount

float4

折扣率

1.0=原價, 0.9=九折

billing_start

date

計費開始日

此日期前視為試用期

created_at

timestamptz

建立時間



3.3 人員表格 (public.staff)

紀錄店內的教練、老師或服務人員。

欄位名稱

類型

說明

備註

id

uuid

Staff ID (PK)



store_id

uuid

所屬店家

FK -> stores.id

name

text

姓名



title

text

職稱

例如：資深教練

avatar

text

頭像 URL

支援 Supabase Storage 或外部連結

login_code

text

後台登入碼

敏感資料 (僅能透過 RPC 驗證)

rating

float4

評分

預設 5.0

deleted_at

timestamptz

軟刪除時間

若有值代表已刪除

3.4 服務/課程表格 (public.services)

紀錄店家提供的服務項目。

欄位名稱

類型

說明

備註

id

uuid

Service ID (PK)



store_id

uuid

所屬店家

FK -> stores.id

name

text

課程名稱



price

int4

價格

單堂費用

duration

int2

時長 (分鐘)

用於計算時段佔用

description

text

描述



deleted_at

timestamptz

軟刪除時間



3.5 預約訂單表格 (public.bookings)

紀錄所有的客戶預約與排休狀況。

欄位名稱

類型

說明

備註

id

uuid

Booking ID (PK)



store_id

uuid

所屬店家

FK -> stores.id

customer_name

text

客戶姓名

若為排休則填寫原因

customer_phone

text

客戶手機

用於查詢訂單

service_name

text

課程名稱

若為排休則填寫「排休/請假」

staff_name

text

指定老師



booking_date

date

預約日期

YYYY-MM-DD

booking_time

text

開始時間

HH:MM

status

text

訂單狀態

confirmed(確認), cancelled(取消), completed(完成), no_show(失約), blocked(排休)

device_info

text

裝置資訊

User Agent 紀錄

created_at

timestamptz

建立時間



4. SaaS 商業模式與計費邏輯 (Revenue Model)

定價策略：由「固定月費」轉型為 「人頭計費 (Per-Seat Pricing)」。

4.1 營收計算公式 (Monthly Revenue Estimate)

平台月營收 = Σ (每間店的預估月費)

單店月費 = (該店員工數 × plan_price) × discount
若 今日 < billing_start，則該店月費為 $0 (試用中)

4.2 資料庫與計算邏輯 (Database Logic)

為實現動態計費，系統採用以下邏輯運作：

數據來源：

店家參數：從 stores 表格讀取費率設定 (plan_price, discount, billing_start)。

人頭統計 (staff_count)：需查詢 staff 表格，並依據 store_id 統計每間店的員工數量。

權限配置 (RLS Policy)：

為了計算人頭，必須開放 Super Admin 讀取 staff 表格的權限 (Policy: "Super admin reads staff")。

運算策略 (Client-side Aggregation)：

考量 No-Build 架構，不使用後端 API 聚合。

前端 superadmin.html 會一次撈取所有 stores 與 staff (僅 ID 與 StoreID 欄位)，在瀏覽器端進行 Group By 統計與金額計算，以降低資料庫負擔。

5. 功能模組詳解 (Feature Specs)

5.1 平台總控中心 (Super Admin)

入口：/superadmin.html (獨立 Auth 登入介面)。

儀表板：

總店家數、活躍訂閱數 (未過期)。

預估月營收 (自動依據人頭數動態計算)。

店家管理 (CRUD)：

新增/編輯店家基本資料。

SaaS 合約設定：設定人頭單價、折扣、計費開始日。

智慧續約：一鍵延展效期 (+1月、+3月、+1年)。

5.2 商家管理後台 (Store Admin)

入口：/admin.html (Auth 登入)。

登入檢查：

到期凍結：若 valid_until < 今日，登入後顯示「服務已暫停」全螢幕提示，禁止操作。

緩衝提醒：若效期剩餘 14 天 以內，頂部顯示黃色 Banner 提醒續約。

人員管理：

新增/刪除員工。

設定/隨機生成員工 login_code。

一鍵複製：產生員工專屬後台連結 (staff.html?id=...)。

其他功能：儀表板 (排除失約營收)、排班管理、課程設定。

5.3 員工專屬後台 (Staff App)

入口：/staff.html?id={uuid}。

安全驗證：

輸入 Passcode (login_code)。

透過 Supabase RPC 驗證，前端不再明碼比對。

連坐凍結：

登入時同步檢查所屬店家的 valid_until。

若店家過期，員工亦無法登入，並顯示「店家合約已到期」提示。

功能：查看個人課表、查看個人業績。

5.4 客戶預約前台 (Booking Client)

入口：/booking.html。

體驗優化：

預約成功頁：移除多餘按鈕 (預約下一堂、查看訂單)。

行事曆整合：新增 「加入 Google 日曆」 按鈕 (URL Link 方案，無須 API)。

私域導流：保留「加入 LINE」按鈕。

導覽列修正：在 Step 5 點擊「預約課程」可正確重置回 Step 1。

6. 未來發展路線圖 (Roadmap)

階段一：SaaS MVP (已完成 ✅)

[x] 完成前後端分離架構 (No-Build)。

[x] 導入 Supabase Auth 取代明碼登入。

[x] 實作 RLS 資料庫權限隔離。

[x] 建立 Super Admin 上帝視角與 SaaS 計費邏輯。

[x] 實作訂閱到期凍結與緩衝機制。

[x] 實作員工端 RPC 安全驗證。

[x] 優化 Booking 流程與 Google 日曆串接。

階段二：營運優化 (Next Steps)

[ ] 報表導出：讓店家可以匯出月結算 Excel (薪資計算用)。

[ ] LINE Notify 整合：預約成功後，自動發送 LINE 通知給店家與客戶 (需後端 Edge Function)。

[ ] 多語系支援：介面文字抽離 (i18n)，準備拓展海外市場。

階段三：架構升級 (Scale Up / High Traffic)

當客戶數 > 100 或遭遇惡意攻擊時啟動

[ ] 導入 Next.js + Vercel：

將 API Key 隱藏於 Server-side。

實作 API Rate Limiting (防 DDoS)。

優化 SEO (SSR)。

[ ] Cloudflare WAF：前置防護，過濾惡意流量。

[ ] 金流串接：整合綠界/Stripe，實現自動化扣款續約。

7. 檔案結構總覽

檔案名稱

用途

權限/驗證

備註

index.html

官網 / Demo 入口

公開

行銷頁面

booking.html

客戶預約前台

公開 (LocalStorage)

寫入訂單

admin.html

商家管理後台

Supabase Auth

包含完整 JS 邏輯

superadmin.html

平台總控中心

Supabase Auth

包含完整 JS 邏輯

staff.html

員工專屬後台

URL ID + Passcode (RPC)

包含完整 JS 邏輯

admin.js

(已作廢)

-

邏輯已合併至 admin.html

superadmin.js

(已作廢)

-

邏輯已合併至 superadmin.html
