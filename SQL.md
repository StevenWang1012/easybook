# 資料庫表結構（繁體中文）與外鍵約束SQL
以下是完整的資料庫表結構（繁體中文），並補充各表之間的外鍵約束SQL語句（基於PostgreSQL語法，對應圖中資料庫設計）：

## 一、各表結構（繁體中文）
### 1. `bookings`（預約表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `store_id`      | `uuid`       | 門店ID             | `stores`     |
| `service_name`  | `varchar`    | 服務名稱           | -            |
| `staff_name`    | `varchar`    | 員工姓名           | -            |
| `booking_date`  | `date`       | 預約日期           | -            |
| `booking_time`  | `varchar`    | 預約時間           | -            |
| `customer_name` | `varchar`    | 客戶姓名           | -            |
| `customer_phone`| `varchar`    | 客戶電話           | -            |
| `created_at`    | `timestamp`  | 建立時間           | -            |
| `status`        | `varchar`    | 預約狀態           | -            |
| `device_info`   | `text`       | 設備資訊           | -            |
| `customer_id`   | `uuid`       | 客戶ID             | `customers`  |

### 2. `customers`（客戶表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `store_id`      | `uuid`       | 門店ID             | `stores`     |
| `line_id`       | `text`       | Line帳號ID         | -            |
| `name`          | `text`       | 客戶姓名           | -            |
| `phone`         | `text`       | 客戶電話           | -            |
| `avatar_url`    | `text`       | 大頭照URL          | -            |
| `is_blacklisted`| `boolean`    | 是否黑名單         | -            |
| `notes`         | `text`       | 備註               | -            |
| `created_at`    | `timestamp`  | 建立時間           | -            |

### 3. `services`（服務表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `store_id`      | `uuid`       | 門店ID             | `stores`     |
| `name`          | `varchar`    | 服務名稱           | -            |
| `duration`      | `integer`    | 服務時長（分鐘）   | -            |
| `price`         | `float`      | 服務價格           | -            |
| `description`   | `text`       | 服務描述           | -            |
| `tag`           | `varchar`    | 服務標籤           | -            |

### 4. `staff`（員工表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `store_id`      | `uuid`       | 門店ID             | `stores`     |
| `name`          | `varchar`    | 員工姓名           | -            |
| `title`         | `varchar`    | 職位               | -            |
| `avatar`        | `text`       | 大頭照URL          | -            |
| `rating`        | `numeric`    | 評分               | -            |
| `login_code`    | `varchar`    | 登入碼             | -            |

### 5. `stores`（門店表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `name`          | `varchar`    | 門店名稱           | -            |
| `addr`          | `text`       | 門店地址           | -            |
| `line_id`       | `text`       | Line帳號ID         | -            |
| `description`   | `text`       | 門店描述           | -            |
| `terms`         | `text`       | 條款               | -            |
| `valid_until`   | `date`       | 有效期至           | -            |
| `renew_until`   | `date`       | 續費至             | -            |
| `memo`          | `text`       | 備註               | -            |
| `owner_id`      | `uuid`       | 店主ID             | -            |
| `plan_id`       | `uuid`       | 套裝方案ID         | -            |
| `plan_price`    | `float`      | 套裝方案價格       | -            |
| `discount`      | `float`      | 折扣               | -            |
| `billing_start` | `date`       | 計費開始時間       | -            |
| `open_time`     | `text`       | 營業時間           | -            |
| `close_time`    | `text`       | 打烊時間           | -            |
| `min_book_hours`| `integer`    | 最小預約提前時長（小時） | -        |
| `line_channel_id`| `text`      | Line渠道ID         | -            |
| `created_at`    | `timestamp`  | 建立時間           | -            |

### 6. `platform_admins`（平台管理員表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `created_at`    | `timestamp`  | 建立時間           | -            |
| `email`         | `text`       | 管理員信箱         | -            |
| `password`      | `text`       | 密碼（加密）       | -            |

### 7. `consultation_notes`（諮詢記錄表）
| 欄位名          | 類型         | 說明               | 關聯表       |
|-----------------|--------------|--------------------|--------------|
| `id`            | `uuid`       | 主鍵               | -            |
| `store_id`      | `uuid`       | 門店ID             | `stores`     |
| `customer_id`   | `uuid`       | 客戶ID             | `customers`  |
| `staff_id`      | `uuid`       | 員工ID             | `staff`      |
| `content`       | `text`       | 諮詢內容           | -            |
| `treatment_date`| `date`       | 診療日期           | -            |
| `images`        | `text`       | 圖片（URL列表）    | -            |
| `created_at`    | `timestamp`  | 建立時間           | -            |

