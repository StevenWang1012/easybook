專案概況：EasyBook 預約系統 (SaaS版)

專案狀態： v2.1 (SaaS MVP 完成 / 運營準備中)
核心目標： 打造一個專為個人工作室（瑜珈、皮拉提斯、健身）設計的「輕量化、免安裝」預約系統。支援多店家 (Multi-tenant) 訂閱制營運。

1. 技術架構 (Tech Stack)

架構模式： No-Build (無須編譯打包)，直接在瀏覽器運行。
前端核心： HTML5 + React (UMD CDN) + Babel Standalone (瀏覽器端編譯 JSX)。
樣式庫： Tailwind CSS (CDN)。
後端/資料庫： Supabase (PostgreSQL) + Row Level Security (RLS)。
圖標庫： Lucide Icons。
部署環境： GitHub Pages (靜態託管)。

2. 檔案結構與功能模組

目前專案由以下 5 個核心檔案組成：

index.html (產品入口 / Landing Page)

角色：行銷官網。
功能：介紹產品特色、提供三個角色的 Demo 入口（客人、老闆、員工）。

booking.html (C端 - 客戶預約前台)

角色：給消費者預約課程用。
核心功能：
店家資訊與公告 (跑馬燈)。
三步驟預約：選課 -> 選人 -> 選時段 (動態計算 30 分鐘格)。
防呆機制：阻擋已額滿或重疊的時段。
我的訂單：透過「手機 + 姓名」雙重驗證查詢未來行程與取消預約。
裝置紀錄：寫入訂單時自動記錄 User Agent (device_info)。
狀態保存：利用 localStorage 記住訪客資訊，顯示未完成訂單紅點。

admin.html (B端 - 商家總控後台)

角色：給工作室老闆管理店務用。
核心功能：
登入驗證：比對 stores 資料表，檢查帳號密碼與 valid_until (授權效期)。
儀表板：今日營收、今日訂單、熱門課程分析 (自動排除失約與排休數據)。
排班管理：檢視與設定教練休假，支援「連續時段合併顯示」。
資料管理：課程 (Services)、人員 (Staff)、商店設定 (Settings) 的 CRUD。
技術備註：為了避開 CORS 問題，JS 邏輯建議內嵌於 HTML 中或使用正確的 Fetch 載入器。

staff.html (B端 - 員工專屬後台)

角色：給教練/老師看課表用。
核心功能：
獨立登入碼 (login_code) 驗證。
個人儀表板：查看今日/本月個人業績 (排除失約)。
時間軸課表：格狀顯示每日行程。
狀態操作：可將訂單標記為「✅ 完成」或「🚫 失約 (No-Show)」。
superadmin.html + superadmin.js (平台超級後台)
角色：給系統販售者 (您) 管理所有店家用。
核心功能：
店家列表：查看平台所有客戶。
新增店家：開通新帳號。
權限管理：修改店家密碼、設定訂閱到期日 (valid_until)。

3. 資料庫架構 (Supabase Schema)

目前採用單一資料庫、多租戶 (store_id) 隔離的設計。
platform_admins：超級管理員帳號 (username, password)。
stores：店家資料 (id, name, username, password, valid_until)。
services：課程項目 (store_id, name, price, duration)。
staff：員工資料 (store_id, name, login_code, avatar)。
bookings：訂單核心 (store_id, booking_date, time, status, device_info)。
Status 狀態流：confirmed (已預約) -> completed (完成) / cancelled (取消) / no_show (失約) / blocked (排休)。

4. 下一步開發建議 (Roadmap v3.0)

當前版本已具備完整的營運能力，下一階段建議優先處理：

效能優化：

目前 DashboardView 是一次撈取所有歷史訂單。需改為「分頁讀取」或「只撈取本月資料 (.gte, .lte)」，避免資料量大時卡頓。
會員系統 (CRM)：
建立 members 表格，將 customer_name/phone 轉為實體會員，紀錄消費歷史與剩餘點數。
金流串接：
整合綠界/藍新，支援預付訂金，減少 No-Show 率。
真實身分驗證：
目前使用資料庫比對字串的方式模擬登入。未來可升級為 Supabase Auth (Email/Password) 以提升安全性。
