const { useState, useEffect, useRef, useMemo } = React;

// ★ 設定 Supabase 連線
const supabaseUrl = 'https://kwvbhzjzysmivafsvwng.supabase.co';
const supabaseKey = 'sb_publishable_7RUbenk2kXNDmvuo1XtHbQ_m0RjXuZr'; 
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// 動態生成時段
const generateTimeSlots = () => {
    const slots = [];
    for (let h = 8; h <= 21; h++) {
        slots.push(`${h.toString().padStart(2, '0')}:00`);
        if (h < 21) slots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    return slots;
};
const ALL_TIME_SLOTS = generateTimeSlots();

// 圖標元件
const Icon = ({ name, size = 20, className = "" }) => {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current || !window.lucide) return;
        const i = document.createElement('i');
        i.setAttribute('data-lucide', name);
        i.setAttribute('width', size);
        i.setAttribute('height', size);
        if (className) i.setAttribute('class', className);
        ref.current.innerHTML = '';
        ref.current.appendChild(i);
        window.lucide.createIcons({ root: ref.current });
    }, [name, size, className]);
    return <span ref={ref} className="inline-flex items-center justify-center"></span>;
};

// --- 1. 儀表板 (升級版：支援排休合併顯示) ---
function DashboardView({ supabase }) {
    const [bookings, setBookings] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [tab, setTab] = useState('bookings'); // bookings | leaves
    const [timeFilter, setTimeFilter] = useState('today'); // today | tomorrow | all

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        setLoading(true);
        setErrorMsg('');
        try {
            const [bookingRes, serviceRes] = await Promise.all([
                supabase.from('bookings').select('*').order('booking_date', { ascending: true }).order('booking_time', { ascending: true }),
                supabase.from('services').select('name, price')
            ]);

            if (bookingRes.error) throw bookingRes.error;
            setBookings(bookingRes.data || []);
            setServices(serviceRes.data || []);

        } catch (err) {
            console.error("讀取失敗:", err);
            setErrorMsg(err.message || "無法讀取資料");
        } finally {
            setLoading(false);
        }
    }

    async function updateStatus(id, newStatus) {
        if(!confirm(`確定要更改狀態為「${newStatus}」嗎？`)) return;
        try {
            const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (err) {
            alert("操作失敗: " + err.message);
        }
    }

    // ★ 新增：合併排休時段邏輯
    const mergeLeaveSlots = (leaves) => {
        if (leaves.length === 0) return [];
        
        // 先依照老師與日期排序
        const sorted = [...leaves].sort((a, b) => {
            if (a.staff_name !== b.staff_name) return a.staff_name.localeCompare(b.staff_name);
            if (a.booking_date !== b.booking_date) return a.booking_date.localeCompare(b.booking_date);
            return a.booking_time.localeCompare(b.booking_time);
        });

        const merged = [];
        let currentGroup = null;

        sorted.forEach((leave) => {
            // 判斷是否為連續時段 (假設間隔是 30 分鐘)
            // 簡化邏輯：如果是同一人、同一天、同一原因，且時間是列表中下一個，則合併
            // 這裡採用更寬鬆的「同一天同一人同一事由」即視為一組，顯示範圍從最早到最晚
            
            if (currentGroup && 
                currentGroup.staff_name === leave.staff_name && 
                currentGroup.booking_date === leave.booking_date && 
                currentGroup.reason === leave.customer_name) {
                
                // 更新結束時間
                currentGroup.endTime = leave.booking_time;
                currentGroup.ids.push(leave.id); // 收集所有 ID 以便批次刪除
            } else {
                // 開新群組
                if (currentGroup) merged.push(currentGroup);
                currentGroup = {
                    id: leave.id, // 用第一個 ID 當代表
                    ids: [leave.id],
                    staff_name: leave.staff_name,
                    booking_date: leave.booking_date,
                    startTime: leave.booking_time,
                    endTime: leave.booking_time,
                    reason: leave.customer_name
                };
            }
        });
        if (currentGroup) merged.push(currentGroup);
        return merged;
    };

    // --- 批次取消休假 ---
    async function batchCancelLeave(ids) {
        if(!confirm(`確定要取消這 ${ids.length} 個排休時段嗎？`)) return;
        try {
            const { error } = await supabase.from('bookings').delete().in('id', ids); // 直接刪除 blocked 紀錄
            if (error) throw error;
            fetchData();
        } catch (err) {
            alert("取消失敗: " + err.message);
        }
    }

    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
        const tmrStr = tomorrow.toISOString().split('T')[0];

        let todayRev = 0, todayCount = 0, monthRev = 0, monthCount = 0;
        const serviceStats = {};
        const timeStats = {};

        let displayList = bookings.filter(b => {
            if (timeFilter === 'today') return b.booking_date === today;
            if (timeFilter === 'tomorrow') return b.booking_date === tmrStr;
            return true; 
        });

        const bookingList = displayList.filter(b => b.status !== 'blocked');
        
        // 原始排休列表
        const rawLeaves = displayList.filter(b => b.status === 'blocked');
        // ★ 執行合併
        const leaveList = mergeLeaveSlots(rawLeaves);

        bookings.forEach(b => {
            const isValid = b.status === 'confirmed' || b.status === 'completed';
            const price = services.find(s => s.name === b.service_name)?.price || 0;

            if (isValid) {
                if (b.booking_date.startsWith(today.slice(0, 7))) {
                    monthRev += price;
                    monthCount++;
                }
                if (b.booking_date === today) {
                    todayRev += price;
                    todayCount++;
                }
                serviceStats[b.service_name] = (serviceStats[b.service_name] || 0) + 1;
                const hour = b.booking_time.split(':')[0];
                timeStats[hour] = (timeStats[hour] || 0) + 1;
            }
        });

        const topServices = Object.entries(serviceStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3);

        return { 
            todayRev, todayCount, monthRev, monthCount, 
            bookingList, leaveList, topServices, timeStats
        };
    }, [bookings, services, timeFilter]);

    return (
        <div className="space-y-6 animate-fade-in-up">
            {errorMsg && <div className="bg-red-50 text-red-700 p-4 rounded-xl flex justify-between items-center"><span className="flex items-center"><Icon name="alert-triangle" className="mr-2"/>{errorMsg}</span><button onClick={fetchData} className="font-bold underline">重試</button></div>}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div><p className="text-xs text-slate-400 font-bold mb-1">今日預約</p><h3 className="text-2xl font-black text-slate-800">{stats.todayCount} <span className="text-sm font-normal text-slate-400">單</span></h3></div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Icon name="calendar-check" /></div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div><p className="text-xs text-slate-400 font-bold mb-1">今日營收</p><h3 className="text-2xl font-black text-emerald-600">${stats.todayRev.toLocaleString()}</h3></div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Icon name="dollar-sign" /></div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div><p className="text-xs text-slate-400 font-bold mb-1">本月累積營收</p><h3 className="text-2xl font-black text-slate-800">${stats.monthRev.toLocaleString()}</h3></div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Icon name="trending-up" /></div>
                </div>
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-lg flex flex-col justify-center items-center text-center">
                    <p className="text-xs opacity-60 mb-1">本月訂單總數</p>
                    <h3 className="text-3xl font-black text-emerald-400">{stats.monthCount}</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setTab('bookings')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${tab === 'bookings' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <Icon name="users" size={16} className="mr-2" /> 客戶預約
                                <span className="ml-2 bg-slate-100 px-2 rounded-full text-xs text-slate-500">{stats.bookingList.length}</span>
                            </button>
                            <button onClick={() => setTab('leaves')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${tab === 'leaves' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <Icon name="coffee" size={16} className="mr-2" /> 人員排休
                                <span className="ml-2 bg-slate-100 px-2 rounded-full text-xs text-slate-500">{stats.leaveList.length}</span>
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-emerald-500">
                                <option value="today">📅 今日行程</option>
                                <option value="tomorrow">🌤 明日預告</option>
                                <option value="all">📚 全部列表</option>
                            </select>
                            <button onClick={fetchData} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><Icon name="refresh-cw" size={18}/></button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {loading ? <div className="text-center p-10 text-slate-400">載入中...</div> : 
                         tab === 'bookings' ? (
                            stats.bookingList.length === 0 ? <div className="text-center p-10 text-slate-400">目前沒有預約資料 🍃</div> :
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                    <tr><th className="p-3 pl-4">時間</th><th className="p-3">客戶</th><th className="p-3">項目/老師</th><th className="p-3 text-center">狀態</th><th className="p-3 text-right pr-4">操作</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {stats.bookingList.map(b => (
                                        <tr key={b.id} className="hover:bg-slate-50 transition">
                                            <td className="p-3 pl-4">
                                                <div className="font-bold text-slate-800">{b.booking_time}</div>
                                                <div className="text-xs text-slate-400">{b.booking_date}</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-slate-700">{b.customer_name}</div>
                                                <div className="text-xs text-slate-400 font-mono">{b.customer_phone}</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded w-fit text-xs mb-1">{b.service_name}</div>
                                                <div className="text-xs text-slate-500 flex items-center"><Icon name="user" size={10} className="mr-1"/>{b.staff_name}</div>
                                            </td>
                                            <td className="p-3 text-center">
                                                {b.status === 'completed' ? <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs font-bold">已完成</span> : 
                                                 b.status === 'cancelled' ? <span className="text-red-400 bg-red-50 px-2 py-1 rounded text-xs font-bold">已取消</span> :
                                                 <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs font-bold animate-pulse">進行中</span>}
                                            </td>
                                            <td className="p-3 text-right pr-4">
                                                {b.status === 'confirmed' && (
                                                    <div className="flex justify-end gap-1">
                                                        <button onClick={() => updateStatus(b.id, 'completed')} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded" title="完成"><Icon name="check" size={16}/></button>
                                                        <button onClick={() => updateStatus(b.id, 'cancelled')} className="p-2 text-red-400 hover:bg-red-100 rounded" title="取消"><Icon name="x" size={16}/></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            stats.leaveList.length === 0 ? <div className="text-center p-10 text-slate-400">全員到齊，無人排休 💪</div> :
                            <div className="space-y-2 p-2">
                                {stats.leaveList.map(group => (
                                    <div key={group.id} className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-xl">
                                        <div className="flex items-center gap-4">
                                            <div className="text-center min-w-[100px]">
                                                <div className="font-bold text-red-800 text-lg">
                                                    {group.startTime} {group.startTime !== group.endTime && `- ${group.endTime}`}
                                                </div>
                                                <div className="text-xs text-red-400 font-bold">{group.booking_date}</div>
                                                <div className="text-[10px] bg-red-100 text-red-600 px-1 rounded mt-1 inline-block">共 {group.ids.length} 時段</div>
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 flex items-center"><Icon name="user-x" size={16} className="mr-2 text-red-500"/> {group.staff_name}</div>
                                                <div className="text-sm text-slate-500 mt-1">事由：{group.reason}</div>
                                            </div>
                                        </div>
                                        <button onClick={() => batchCancelLeave(group.ids)} className="px-3 py-1 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100">取消休假</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center"><Icon name="trophy" className="mr-2 text-yellow-500"/> 熱門課程 Top 3</h4>
                        <div className="space-y-4">
                            {stats.topServices.length === 0 ? <p className="text-sm text-slate-400">尚無數據</p> : stats.topServices.map(([name, count], idx) => (
                                <div key={name} className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${idx===0 ? 'bg-yellow-100 text-yellow-700' : idx===1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600'}`}>{idx+1}</div>
                                        <span className="text-sm font-bold text-slate-700">{name}</span>
                                    </div>
                                    <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded text-slate-500">{count} 次</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center"><Icon name="clock" className="mr-2 text-blue-500"/> 熱門時段分布</h4>
                        <div className="flex items-end gap-1 h-32 pt-4 border-b border-slate-100">
                            {['09', '10', '14', '15', '19', '20'].map(hour => {
                                const val = stats.timeStats[hour] || 0;
                                const max = Math.max(...Object.values(stats.timeStats), 1);
                                const h = (val / max) * 100;
                                return (
                                    <div key={hour} className="flex-1 flex flex-col items-center justify-end h-full group">
                                        <div className="w-full bg-blue-100 rounded-t-sm transition-all duration-500 group-hover:bg-blue-400 relative" style={{height: `${h}%`}}>
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition">{val}</div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1">{hour}點</span>
                                    </div>
                                )
                            })}
                        </div>
                        <p className="text-xs text-slate-400 mt-2 text-center">僅顯示重點時段趨勢</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- 2. 排班管理 ---
function MonthlyOverview({ supabase, selectedDate, staffList }) {
    const [scheduleMap, setScheduleMap] = useState({});
    const [days, setDays] = useState([]);

    useEffect(() => {
        const [y, m] = selectedDate.split('-');
        const year = parseInt(y);
        const month = parseInt(m) - 1; 
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        setDays(Array.from({ length: daysInMonth }, (_, i) => i + 1));

        async function fetchMonth() {
            const start = `${y}-${m}-01`;
            const end = `${y}-${m}-${daysInMonth}`;
            const { data } = await supabase.from('bookings').select('staff_name, booking_date, status').gte('booking_date', start).lte('booking_date', end).neq('status', 'cancelled');
            if (data) {
                const map = {};
                data.forEach(b => {
                    const day = parseInt(b.booking_date.split('-')[2]);
                    if (!map[b.staff_name]) map[b.staff_name] = {};
                    const current = map[b.staff_name][day];
                    if (b.status === 'blocked') map[b.staff_name][day] = 'leave'; 
                    else if (b.status === 'confirmed' || b.status === 'pending') if (current !== 'leave') map[b.staff_name][day] = 'work';
                });
                setScheduleMap(map);
            }
        }
        fetchMonth();
    }, [selectedDate, supabase]);

    return (
        <div className="mt-8 pt-6 border-t border-gray-100">
            <h4 className="font-bold text-slate-700 mb-4 flex items-center"><Icon name="calendar" size={16} className="mr-2" /> 本月排班總覽 ({selectedDate.slice(0, 7)})</h4>
            <div className="overflow-x-auto pb-2">
                <table className="w-full text-xs border-collapse min-w-[800px]">
                    <thead><tr><th className="p-2 border bg-gray-50 text-left sticky left-0 z-10 w-24 border-r-2 border-r-gray-200">人員</th>{days.map(d => <th key={d} className="p-1 border bg-gray-50 min-w-[24px] text-center text-slate-500">{d}</th>)}</tr></thead>
                    <tbody>{staffList.map(staff => (<tr key={staff.id}><td className="p-2 border bg-white font-bold sticky left-0 z-10 flex items-center border-r-2 border-r-gray-200"><span className="truncate">{staff.name}</span></td>{days.map(d => { const status = scheduleMap[staff.name]?.[d]; let cellClass = "bg-white"; let content = ""; if (status === 'leave') { cellClass = "bg-red-50 text-red-500 font-bold"; content = "休"; } else if (status === 'work') { cellClass = "bg-emerald-50 text-emerald-500"; content = "●"; } return <td key={d} className={`border text-center ${cellClass}`}>{content}</td> })}</tr>))}</tbody>
                </table>
            </div>
        </div>
    );
}

function ScheduleManager({ supabase }) {
    const [staffList, setStaffList] = useState([]);
    const [services, setServices] = useState([]); // ★ 新增：儲存服務列表以查詢時長
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [blockedSlots, setBlockedSlots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showFormModal, setShowFormModal] = useState(false);
    const [leaveData, setLeaveData] = useState({ start: '08:00', end: '12:00', reason: '事假' });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', details: [], onConfirm: null, isDelete: false });

    // ★ 修改：同時抓取人員與服務
    useEffect(() => { 
        fetchStaff(); 
        fetchServices(); 
    }, []);
    
    useEffect(() => { if (selectedStaff) fetchSchedule(); }, [selectedStaff, selectedDate]);

    async function fetchStaff() {
        const { data } = await supabase.from('staff').select('*');
        if (data) {
            setStaffList(data.filter(s => !s.deleted_at));
            if (data.length > 0) setSelectedStaff(data[0]);
        }
    }

    // ★ 新增：抓取服務時長
    async function fetchServices() {
        const { data } = await supabase.from('services').select('name, duration');
        if (data) setServices(data);
    }

    async function fetchSchedule() {
        setLoading(true);
        // ★ 修改：多抓取 service_name 以便對應時長
        const { data } = await supabase.from('bookings')
            .select('booking_time, status, id, customer_name, service_name')
            .eq('staff_name', selectedStaff.name)
            .eq('booking_date', selectedDate)
            .neq('status', 'cancelled');
        if (data) setBlockedSlots(data);
        setLoading(false);
    }

    // ★ 新增：計算每個時段的佔用狀態 (含時長推算)
    const slotStatusMap = useMemo(() => {
        const map = {};
        blockedSlots.forEach(booking => {
            if (booking.status === 'blocked') {
                // 排休 (Leave) 是一格一格存的，直接標記
                map[booking.booking_time] = booking;
            } else {
                // 客人預約 (Customer) 需要計算時長
                const service = services.find(s => s.name === booking.service_name);
                const duration = service ? service.duration : 60; // 若找不到，預設 60 分鐘
                const slotsNeeded = Math.ceil(duration / 30); // 需要佔用幾格 (30分鐘一格)
                const startIndex = ALL_TIME_SLOTS.indexOf(booking.booking_time);
                
                if (startIndex >= 0) {
                    for (let i = 0; i < slotsNeeded; i++) {
                        const timeSlot = ALL_TIME_SLOTS[startIndex + i];
                        if (timeSlot) {
                            // 標記該時段被此訂單佔用
                            // 如果是第一格 (i===0)，保留原始資訊；如果是後續格子，也指向同一筆訂單
                            if (!map[timeSlot]) {
                                map[timeSlot] = { 
                                    ...booking, 
                                    isMain: i === 0, // 標記是否為課程開始時間
                                    displayLabel: i === 0 ? '🟢 預約' : '🔒 佔用' 
                                };
                            }
                        }
                    }
                }
            }
        });
        return map;
    }, [blockedSlots, services]);

    const changeDate = (offset) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + offset);
        setSelectedDate(date.toISOString().split('T')[0]);
    };

    async function toggleSlot(time, existingBooking) {
        if (existingBooking) {
            if (existingBooking.status === 'blocked') {
                setConfirmModal({
                    isOpen: true, title: '確認取消休假', isDelete: true,
                    details: [{ label: '人員', value: selectedStaff.name }, { label: '日期', value: selectedDate }, { label: '時間', value: time }, { label: '事由', value: existingBooking.customer_name || '無' }],
                    onConfirm: async () => { await supabase.from('bookings').delete().eq('id', existingBooking.id); setConfirmModal({ ...confirmModal, isOpen: false }); fetchSchedule(); }
                });
            } else { 
                // 即使點擊的是「佔用」時段，也能正確辨識為客人預約
                alert(`這是客人的預約 (${existingBooking.booking_time} 開始)，請至儀表板取消訂單。`); 
            }
        } else {
            setLeaveData({ start: time, end: time, reason: '臨時排休' });
            setShowFormModal(true);
        }
    }

    function handlePrepareBulkLeave() {
        if (!leaveData.reason) return alert("請輸入請假原因");
        const startIndex = ALL_TIME_SLOTS.indexOf(leaveData.start);
        const endIndex = ALL_TIME_SLOTS.indexOf(leaveData.end);
        if (startIndex === -1 || endIndex === -1) return alert("時間範圍無效");
        const effectiveEndIndex = endIndex === startIndex ? startIndex + 1 : endIndex;
        if (startIndex > effectiveEndIndex) return alert("時間範圍無效");

        setConfirmModal({
            isOpen: true, title: '確認排休資訊', isDelete: false,
            details: [{ label: '服務人員', value: selectedStaff.name }, { label: '請假日期', value: selectedDate }, { label: '請假時間', value: `${leaveData.start} ~ ${leaveData.end === leaveData.start ? leaveData.start : ALL_TIME_SLOTS[effectiveEndIndex] || leaveData.end}` }, { label: '請假事由', value: leaveData.reason }],
            onConfirm: async () => { await executeBulkLeave(startIndex, effectiveEndIndex); setConfirmModal({ ...confirmModal, isOpen: false }); setShowFormModal(false); }
        });
    }

    async function executeBulkLeave(startIndex, endIndex) {
        const targetSlots = ALL_TIME_SLOTS.slice(startIndex, endIndex);
        const { data: stores } = await supabase.from('stores').select('id').limit(1);
        const storeId = stores[0]?.id;
        const newBookings = targetSlots.map(time => ({
            store_id: storeId, staff_name: selectedStaff.name, booking_date: selectedDate, booking_time: time, status: 'blocked', customer_name: leaveData.reason, service_name: '排休/請假'
        }));
        const { error } = await supabase.from('bookings').insert(newBookings);
        if (error) alert("請假設定失敗: " + error.message); else fetchSchedule();
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg">排班與休假管理</h3>
                <button onClick={() => { setLeaveData({ start: '08:00', end: '12:00', reason: '事假' }); setShowFormModal(true); }} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600 flex items-center shadow-md active:scale-95 transition"><Icon name="calendar-off" size={16} className="mr-2"/> 新增排休/請假</button>
            </div>
            <div className="flex flex-col md:flex-row gap-6 mb-8">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">選擇日期</label>
                    <div className="flex items-center gap-2">
                        <button onClick={() => changeDate(-1)} className="p-3 border rounded-xl hover:bg-slate-100 transition active:scale-95"><Icon name="chevron-left" size={18}/></button>
                        <input type="date" className="p-3 border rounded-xl bg-gray-50 text-center font-bold text-slate-700" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}/>
                        <button onClick={() => changeDate(1)} className="p-3 border rounded-xl hover:bg-slate-100 transition active:scale-95"><Icon name="chevron-right" size={18}/></button>
                    </div>
                </div>
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-2">選擇人員</label>
                    <div className="flex space-x-2 overflow-x-auto pb-2">
                        {staffList.map(s => (<button key={s.id} onClick={() => setSelectedStaff(s)} className={`flex items-center px-4 py-3 rounded-full border transition whitespace-nowrap ${selectedStaff?.id === s.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><img src={s.avatar} className="w-6 h-6 rounded-full mr-2 bg-gray-200" />{s.name}</button>))}
                    </div>
                </div>
            </div>
            <div className="border-t border-gray-100 pt-6">
                <h4 className="font-bold text-slate-700 mb-4 flex items-center">{selectedDate} 的時段狀態 {loading && <span className="ml-2 text-xs text-slate-400 font-normal">讀取中...</span>}</h4>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {ALL_TIME_SLOTS.map(time => {
                        // ★ 修改：改為從計算過的 slotStatusMap 讀取狀態
                        const booking = slotStatusMap[time];
                        const isCustomer = booking && booking.status !== 'blocked';
                        const isLeave = booking && booking.status === 'blocked';
                        
                        return (
                            <button 
                                key={time} 
                                onClick={() => toggleSlot(time, booking)} 
                                className={`p-2 rounded-lg border text-center transition relative overflow-hidden group min-h-[70px] flex flex-col items-center justify-center 
                                    ${isCustomer ? 'bg-emerald-100 border-emerald-200 cursor-not-allowed' : 
                                      isLeave ? 'bg-red-50 border-red-200' : 
                                      'bg-white hover:border-slate-400'}`}
                            >
                                <div className="font-bold text-sm mb-1">{time}</div>
                                <div className={`text-[10px] font-bold ${isCustomer ? 'text-emerald-700' : isLeave ? 'text-red-500' : 'text-slate-300'}`}>
                                    {isCustomer ? (booking.displayLabel || '🟢 預約') : 
                                     isLeave ? `⛔ ${booking.customer_name || '休假'}` : 
                                     '⚪️ 空'}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
            <MonthlyOverview supabase={supabase} selectedDate={selectedDate} staffList={staffList} />
            {showFormModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6 border-b pb-4"><h3 className="text-xl font-bold text-slate-800">新增排休 / 請假</h3><button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-slate-600"><Icon name="x" /></button></div>
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600 mb-2">為 <strong>{selectedStaff?.name}</strong> 設定 <strong>{selectedDate}</strong> 的休假</div>
                            <div><label className="block text-xs font-bold text-slate-500 mb-1">請假原因</label><select className="w-full p-3 border rounded-xl bg-white" value={leaveData.reason} onChange={e => setLeaveData({...leaveData, reason: e.target.value})}><option value="事假">事假</option><option value="病假">病假</option><option value="公休">公休</option><option value="進修">進修課程</option><option value="用餐">用餐休息</option><option value="臨時排休">臨時排休</option></select></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">開始時間</label><select className="w-full p-3 border rounded-xl bg-white" value={leaveData.start} onChange={e => setLeaveData({...leaveData, start: e.target.value})}>{ALL_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">結束時間 (含)</label><select className="w-full p-3 border rounded-xl bg-white" value={leaveData.end} onChange={e => setLeaveData({...leaveData, end: e.target.value})}>{ALL_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            </div>
                            <div className="flex justify-end space-x-2 pt-4"><button onClick={() => setShowFormModal(false)} className="px-4 py-3 text-slate-500 hover:bg-slate-100 rounded-xl font-bold">取消</button><button onClick={handlePrepareBulkLeave} className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-lg active:scale-95 transition">下一步：確認</button></div>
                        </div>
                    </div>
                </div>
            )}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in-up border-2 border-slate-100">
                        <div className="text-center mb-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmModal.isDelete ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-600'}`}><Icon name={confirmModal.isDelete ? 'trash-2' : 'check-circle'} size={32} /></div><h3 className="text-xl font-bold text-slate-800">{confirmModal.title}</h3><p className="text-sm text-slate-400 mt-1">請核對以下資訊是否正確</p></div>
                        <div className="bg-slate-50 rounded-xl p-4 space-y-3 mb-6">{confirmModal.details.map((detail, idx) => (<div key={idx} className="flex justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0"><span className="text-slate-500 font-bold">{detail.label}</span><span className="text-slate-800 font-medium">{detail.value}</span></div>))}</div>
                        <div className="flex gap-3"><button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition">再想一下</button><button onClick={confirmModal.onConfirm} className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg active:scale-95 transition ${confirmModal.isDelete ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-800 hover:bg-slate-900'}`}>確認執行</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- 3. 課程服務管理 ---
function ServiceManager({ supabase }) {
    const [services, setServices] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ id: null, name: '', price: 1000, duration: 60, description: '' });

    useEffect(() => { fetchServices(); fetchStaff(); }, []);

    async function fetchServices() {
        setLoading(true);
        const { data, error } = await supabase.from('services').select('*');
        if (!error && data) setServices(data.filter(item => !item.deleted_at));
        setLoading(false);
    }

    async function fetchStaff() {
        const { data } = await supabase.from('staff').select('*');
        if (data) setStaffList(data.filter(item => !item.deleted_at));
    }

    async function handleDelete(id, name) {
        if(!confirm(`確定要刪除「${name}」嗎？`)) return;
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('service_name', name).neq('status', 'cancelled').gte('booking_date', today);
        if (count > 0) {
            if (!confirm(`⚠️ 警告：尚有 ${count} 筆預約！\n是否執行軟刪除？`)) return;
            const softDeleteDate = new Date(); softDeleteDate.setHours(0,0,0,0);
            await supabase.from('services').update({ deleted_at: softDeleteDate.toISOString() }).eq('id', id);
        } else {
            await supabase.from('services').delete().eq('id', id);
        }
        fetchServices();
    }

    async function handleSubmit() {
        const { data: stores } = await supabase.from('stores').select('id').limit(1);
        const storeId = stores[0]?.id;
        const payload = { name: formData.name, price: formData.price, duration: formData.duration, description: formData.description, store_id: storeId };
        let error;
        if (formData.id) error = (await supabase.from('services').update(payload).eq('id', formData.id)).error;
        else error = (await supabase.from('services').insert([payload])).error;
        if (!error) { setIsEditing(false); fetchServices(); } else alert("儲存失敗: " + error.message);
    }

    function openEdit(service = null) {
        setFormData(service ? { ...service } : { id: null, name: '', price: 1000, duration: 60, description: '' });
        setIsEditing(true);
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">課程服務管理</h3><button onClick={() => openEdit()} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center"><Icon name="plus" size={16} className="mr-2"/> 新增課程</button></div>
            {isEditing && (
                <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-emerald-200 shadow-inner">
                    <h4 className="font-bold text-lg text-emerald-800 mb-4">{formData.id ? '編輯課程' : '新增課程'}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div><label className="text-xs text-slate-500 font-bold">課程名稱</label><input className="w-full p-2 border rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                        <div><label className="text-xs text-slate-500 font-bold">價格 ($)</label><input type="number" className="w-full p-2 border rounded" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} /></div>
                        <div><label className="text-xs text-slate-500 font-bold">時長 (分鐘)</label><input type="number" className="w-full p-2 border rounded" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} /></div>
                        <div><label className="text-xs text-slate-500 font-bold">描述</label><input className="w-full p-2 border rounded" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                    </div>
                    <div className="flex justify-end space-x-2 border-t border-gray-200 pt-4"><button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-500 hover:bg-gray-200 rounded">取消</button><button onClick={handleSubmit} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700">{formData.id ? '更新資料' : '確認新增'}</button></div>
                </div>
            )}
            <div className="space-y-3">{loading ? <div className="text-center text-slate-400 py-4">讀取中...</div> : services.map(s => (<div key={s.id} className="flex justify-between items-center p-4 border border-gray-100 rounded-xl hover:border-emerald-200 transition bg-white"><div><div className="font-bold text-slate-700 text-lg">{s.name}</div><div className="text-xs text-slate-400 flex items-center mt-1"><span className="bg-slate-100 px-2 py-0.5 rounded mr-2 text-slate-600">{s.duration} 分鐘</span><span className="font-mono font-bold text-emerald-600">${s.price}</span></div></div><div className="flex space-x-2"><button onClick={() => openEdit(s)} className="text-blue-500 hover:bg-blue-50 p-2 rounded transition" title="編輯"><Icon name="edit" size={18}/></button><button onClick={() => handleDelete(s.id, s.name)} className="text-red-400 hover:bg-red-50 p-2 rounded transition" title="刪除"><Icon name="trash-2" size={18}/></button></div></div>))}</div>
        </div>
    );
}

// --- 4. 人員管理 (已優化：顯示密碼 & 隨機生成) ---
function StaffManager({ supabase }) {
    const [staff, setStaff] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ id: null, name: '', title: '', avatar: '', login_code: '0000' });
    const fileInputRef = useRef(null);

    useEffect(() => { fetchStaff(); }, []);

    async function fetchStaff() {
        setLoading(true);
        const { data, error } = await supabase.from('staff').select('*');
        if (!error && data) setStaff(data.filter(item => !item.deleted_at));
        setLoading(false);
    }

    async function handleDelete(id, name) {
        if(!confirm(`確定要移除「${name}」嗎？`)) return;
        const { data: targetStaff } = await supabase.from('staff').select('avatar').eq('id', id).single();
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('staff_name', name).neq('status', 'cancelled').gte('booking_date', today);
        if (count > 0) {
            if (!confirm(`⚠️ 警告：此人員尚有 ${count} 筆預約！\n是否執行軟刪除？`)) return;
            const softDeleteDate = new Date(); softDeleteDate.setHours(0,0,0,0);
            await supabase.from('staff').update({ deleted_at: softDeleteDate.toISOString() }).eq('id', id);
        } else {
            if (targetStaff?.avatar && targetStaff.avatar.includes('/avatars/')) {
                const filePath = decodeURIComponent(targetStaff.avatar.split('/avatars/')[1]);
                await supabase.storage.from('avatars').remove([filePath]);
            }
            await supabase.from('staff').delete().eq('id', id);
        }
        fetchStaff();
    }

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const { error } = await supabase.storage.from('avatars').upload(fileName, file);
            if (error) return alert("上傳失敗：請確認 Supabase Storage 'avatars' bucket 權限設定。");
            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            setFormData({ ...formData, avatar: data.publicUrl });
        } catch (err) { alert("上傳錯誤"); }
    }

    async function handleSubmit() {
        const { data: stores } = await supabase.from('stores').select('id').limit(1);
        const storeId = stores[0]?.id;
        const finalAvatar = formData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name}`;
        const payload = { name: formData.name, title: formData.title, store_id: storeId, avatar: finalAvatar, rating: 5.0, login_code: formData.login_code };
        let error;
        if (formData.id) error = (await supabase.from('staff').update(payload).eq('id', formData.id)).error;
        else error = (await supabase.from('staff').insert([payload])).error;
        if (!error) { setIsEditing(false); fetchStaff(); } else alert("儲存失敗: " + error.message);
    }

    function openEdit(person = null) {
        setFormData(person || { id: null, name: '', title: '', avatar: '', login_code: '0000' });
        setIsEditing(true);
    }

    // ★ 新增：隨機產生密碼 (已更新為強密碼)
    const generateRandomCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // 排除容易混淆的 1, l, I, 0, O
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setFormData(prev => ({ ...prev, login_code: code }));
    };

    const copyLink = (id) => {
        const url = `${window.location.origin}/staff.html?id=${id}`;
        navigator.clipboard.writeText(url);
        alert("已複製老師專屬連結！\n請貼到 LINE 給老師：" + url);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">人員管理</h3><button onClick={() => openEdit()} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center"><Icon name="plus" size={16} className="mr-2"/> 新增人員</button></div>
            {isEditing && (
                <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-emerald-200 shadow-inner">
                    <h4 className="font-bold text-lg text-emerald-800 mb-4">{formData.id ? '編輯人員' : '新增人員'}</h4>
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex flex-col items-center"><div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden mb-2 border-4 border-white shadow-sm"><img src={formData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name || 'default'}`} className="w-full h-full object-cover" /></div><button onClick={() => fileInputRef.current.click()} className="text-xs bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded">上傳照片</button><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} /></div>
                        <div className="flex-1 grid grid-cols-1 gap-4">
                            <div><label className="text-xs text-slate-500 font-bold">姓名</label><input className="w-full p-2 border rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                            <div><label className="text-xs text-slate-500 font-bold">職稱</label><input className="w-full p-2 border rounded" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                            {/* ★ 優化：增加隨機按鈕 */}
                            <div>
                                <label className="text-xs text-slate-500 font-bold">後台登入碼 (Passcode)</label>
                                <div className="flex gap-2">
                                    <input type="text" maxLength="6" placeholder="例如: Xy7z" className="flex-1 p-2 border rounded font-mono tracking-widest text-center font-bold text-emerald-600" value={formData.login_code} onChange={e => setFormData({...formData, login_code: e.target.value})} />
                                    <button onClick={generateRandomCode} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded text-slate-600 font-bold text-xs">🎲 隨機</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4 border-t border-gray-200 pt-4"><button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-500 hover:bg-gray-200 rounded">取消</button><button onClick={handleSubmit} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700">{formData.id ? '更新資料' : '確認新增'}</button></div>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{loading ? <div className="text-center text-slate-400 py-4 col-span-2">讀取中...</div> : staff.map(s => (
                <div key={s.id} className="flex items-center p-4 border border-gray-100 rounded-xl bg-white hover:border-emerald-200 transition">
                    <img src={s.avatar} className="w-12 h-12 rounded-full bg-gray-200 mr-4 object-cover" />
                    <div className="flex-1">
                        <div className="font-bold text-slate-700">{s.name}</div>
                        <div className="flex items-center text-xs text-slate-400 mb-2">
                            <span className="mr-2">{s.title}</span>
                            {/* ★ 優化：直接顯示密碼 */}
                            <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-500">Code: <strong>{s.login_code || '0000'}</strong></span>
                        </div>
                        <button onClick={() => copyLink(s.id)} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1.5 rounded hover:bg-emerald-100 flex items-center w-fit font-bold"><Icon name="link" size={12} className="mr-1"/> 複製專屬連結</button>
                    </div>
                    <div className="flex space-x-1"><button onClick={() => openEdit(s)} className="text-blue-500 hover:bg-blue-50 p-2 rounded" title="編輯"><Icon name="edit" size={18}/></button><button onClick={() => handleDelete(s.id, s.name)} className="text-red-400 hover:bg-red-50 p-2 rounded" title="移除"><Icon name="trash-2" size={18}/></button></div>
                </div>
            ))}</div>
        </div>
    );
}

// --- 5. 商店設定管理 ---
function SettingsManager({ supabase }) {
    const [store, setStore] = useState({ name: '', address: '', line_url: '', description: '', terms: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetchStore(); }, []);

    async function fetchStore() {
        setLoading(true);
        const { data } = await supabase.from('stores').select('*').limit(1).single();
        if (data) setStore(data);
        setLoading(false);
    }

    async function handleSave() {
        setLoading(true);
        const { error } = await supabase.from('stores').update(store).eq('id', store.id);
        setLoading(false);
        if (error) alert("儲存失敗: " + error.message);
        else alert("設定已更新！");
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-lg mb-6">商店基本設定</h3>
            <div className="space-y-6">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">店名</label><input className="w-full p-3 border rounded-xl" value={store.name} onChange={e => setStore({...store, name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">地址</label><input className="w-full p-3 border rounded-xl" value={store.address} onChange={e => setStore({...store, address: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">LINE 官方帳號連結</label><input className="w-full p-3 border rounded-xl" value={store.line_url} onChange={e => setStore({...store, line_url: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">首頁標語 (Description)</label><textarea className="w-full p-3 border rounded-xl h-24" value={store.description} onChange={e => setStore({...store, description: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">預約須知 & 注意事項 (Terms)</label><textarea className="w-full p-3 border rounded-xl h-40" value={store.terms} onChange={e => setStore({...store, terms: e.target.value})} placeholder="例如：請提前10分鐘到場..." /></div>
                <div className="flex justify-end"><button onClick={handleSave} disabled={loading} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg active:scale-95">{loading ? "儲存中..." : "儲存設定"}</button></div>
            </div>
        </div>
    );
}

// --- 主程式框架 ---
function AdminApp() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentView, setCurrentView] = useState('dashboard');

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-slate-200">
                    <div className="flex justify-center mb-6"><div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-3xl">🧘‍♀️</div></div>
                    <h2 className="text-2xl font-bold text-center text-slate-800 mb-1">Amber Flow</h2>
                    <p className="text-center text-slate-500 text-sm mb-8">商家管理系統</p>
                    <div className="space-y-4">
                        <input type="text" value="admin" disabled className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-mono text-center" />
                        <input type="password" value="1234" disabled className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-mono text-center" />
                        <button onClick={() => setIsLoggedIn(true)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition shadow-lg active:scale-95 flex items-center justify-center mt-4">登入系統 <Icon name="arrow-right" size={16} className="ml-2" /></button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col md:flex-row">
            <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0">
                <div className="p-6 border-b border-slate-800 hidden md:block"><h1 className="text-xl font-bold flex items-center"><span className="mr-2">🧘‍♀️</span> Amber Flow</h1></div>
                <nav className="p-4 space-y-2 flex md:block overflow-x-auto md:overflow-visible">
                    <button onClick={() => setCurrentView('dashboard')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Icon name="layout-dashboard" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">儀表板</span></button>
                    <button onClick={() => setCurrentView('schedule')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'schedule' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Icon name="calendar-clock" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">排班休假</span></button>
                    <button onClick={() => setCurrentView('services')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'services' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Icon name="list" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">課程管理</span></button>
                    <button onClick={() => setCurrentView('staff')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'staff' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Icon name="users" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">人員管理</span></button>
                    <button onClick={() => setCurrentView('settings')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'settings' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Icon name="settings" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">商店設定</span></button>
                </nav>
                <div className="p-4 mt-auto border-t border-slate-800 hidden md:block"><button onClick={() => setIsLoggedIn(false)} className="flex items-center text-slate-400 hover:text-white text-sm"><Icon name="log-out" size={16} className="mr-2" /> 登出</button></div>
            </aside>
            <main className="flex-1 overflow-y-auto bg-gray-50 h-screen">
                <header className="bg-white border-b border-gray-200 p-6 flex justify-between items-center sticky top-0 z-10">
                    <h2 className="text-xl font-bold text-slate-800">{currentView === 'dashboard' ? '今日概況' : currentView === 'schedule' ? '排班休假管理' : currentView === 'services' ? '服務項目設定' : currentView === 'staff' ? '團隊成員設定' : '商店基本設定'}</h2>
                    <div className="flex items-center space-x-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs border-2 border-white shadow-sm">AM</div></div>
                </header>
                <div className="p-6 max-w-5xl mx-auto pb-20">
                    {currentView === 'dashboard' && <DashboardView supabase={supabaseClient} />}
                    {currentView === 'schedule' && <ScheduleManager supabase={supabaseClient} />}
                    {currentView === 'services' && <ServiceManager supabase={supabaseClient} />}
                    {currentView === 'staff' && <StaffManager supabase={supabaseClient} />}
                    {currentView === 'settings' && <SettingsManager supabase={supabaseClient} />}
                </div>
            </main>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AdminApp />);