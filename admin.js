const { useState, useEffect, useRef } = React;

// ★ 設定 Supabase 連線
const supabaseUrl = 'https://kwvbhzjzysmivafsvwng.supabase.co';
const supabaseKey = 'sb_publishable_7RUbenk2kXNDmvuo1XtHbQ_m0RjXuZr'; 
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// 固定時段 (與前台一致)
const TIME_SLOTS = ['09:30', '10:30', '14:00', '15:30', '18:30', '19:45', '20:30'];

// 共用圖標元件
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

// --- 1. 儀表板與訂單管理組件 ---
function DashboardView({ supabase }) {
    const [bookings, setBookings] = useState([]);
    const [stats, setStats] = useState({ count: 0, revenue: 0 });
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetchBookings(); }, []);

    async function fetchBookings() {
        setLoading(true);
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (!error && data) {
            setBookings(data);
            // 統計時排除 'cancelled' 和 'blocked' (休假)
            const validBookings = data.filter(b => b.status !== 'cancelled' && b.status !== 'blocked');
            setStats({ count: validBookings.length, revenue: validBookings.length * 1200 }); // 假設均價
        }
        setLoading(false);
    }

    async function updateStatus(id, newStatus) {
        if(!confirm(`確定要更改狀態為「${newStatus}」嗎？`)) return;
        const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', id);
        if (!error) fetchBookings();
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                        <div><p className="text-sm text-slate-400 mb-1">有效訂單</p><h3 className="text-3xl font-bold text-slate-800">{stats.count}</h3></div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Icon name="ticket" /></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                        <div><p className="text-sm text-slate-400 mb-1">預估營收</p><h3 className="text-3xl font-bold text-slate-800">${stats.revenue.toLocaleString()}</h3></div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Icon name="dollar-sign" /></div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">最新預約</h3>
                    <button onClick={fetchBookings} className="text-sm text-emerald-600 flex items-center font-bold hover:bg-emerald-50 px-3 py-1 rounded transition">
                        <Icon name="refresh-ccw" size={14} className="mr-1" /> 重新整理
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="p-4 font-bold border-b">顧客資料</th>
                                <th className="p-4 font-bold border-b">項目與時間</th>
                                <th className="p-4 font-bold border-b">狀態</th>
                                <th className="p-4 font-bold border-b text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {loading ? <tr><td colSpan="4" className="p-8 text-center text-slate-400">載入中...</td></tr> : 
                                bookings.length === 0 ? <tr><td colSpan="4" className="p-8 text-center text-slate-400">尚無資料</td></tr> :
                                bookings.map(b => (
                                <tr key={b.id} className={`border-b border-gray-100 transition ${b.status === 'cancelled' ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
                                    <td className="p-4">
                                        {b.status === 'blocked' ? 
                                            <span className="text-slate-400 italic">-- 教練休假 --</span> : 
                                            <div>
                                                <div className="font-bold text-slate-700">{b.customer_name}</div>
                                                <div className="text-xs text-slate-400 font-mono">{b.customer_phone}</div>
                                            </div>
                                        }
                                    </td>
                                    <td className="p-4">
                                        <div className="text-emerald-700 font-medium">{b.service_name || '時段鎖定'}</div>
                                        <div className="text-xs text-slate-500 mt-1 flex items-center">
                                            <span className="bg-slate-100 px-2 py-0.5 rounded mr-2">{b.staff_name}</span>
                                            <span>{b.booking_date} {b.booking_time}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {b.status === 'cancelled' ? <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold">已取消</span> :
                                            b.status === 'blocked' ? <span className="bg-gray-200 text-gray-600 px-2 py-1 rounded-full text-xs font-bold">休假/鎖定</span> :
                                            b.status === 'completed' ? <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">已完成</span> :
                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">已預約</span>}
                                    </td>
                                    <td className="p-4 text-right space-x-2">
                                        {b.status !== 'cancelled' && b.status !== 'blocked' && (
                                            <>
                                                <button onClick={() => updateStatus(b.id, 'completed')} className="text-blue-600 hover:bg-blue-50 p-2 rounded" title="完成"><Icon name="check-square" size={18}/></button>
                                                <button onClick={() => updateStatus(b.id, 'cancelled')} className="text-red-400 hover:bg-red-50 p-2 rounded" title="取消"><Icon name="x-circle" size={18}/></button>
                                            </>
                                        )}
                                        {b.status === 'blocked' && (
                                            <button onClick={() => updateStatus(b.id, 'cancelled')} className="text-slate-500 hover:bg-slate-200 p-2 rounded" title="刪除休假 (釋出時段)"><Icon name="trash-2" size={18}/></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// --- 2. 排班管理 ---
function ScheduleManager({ supabase }) {
    const [staffList, setStaffList] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]); // 預設今天
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [blockedSlots, setBlockedSlots] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetchStaff(); }, []);
    useEffect(() => { 
        if (selectedStaff) fetchSchedule(); 
    }, [selectedStaff, selectedDate]);

    async function fetchStaff() {
        const { data } = await supabase.from('staff').select('*');
        if (data) {
            setStaffList(data.filter(s => !s.deleted_at));
            if (data.length > 0) setSelectedStaff(data[0]);
        }
    }

    async function fetchSchedule() {
        setLoading(true);
        const { data } = await supabase.from('bookings')
            .select('booking_time, status, id')
            .eq('staff_name', selectedStaff.name)
            .eq('booking_date', selectedDate)
            .neq('status', 'cancelled');
        
        if (data) setBlockedSlots(data);
        setLoading(false);
    }

    async function toggleSlot(time, existingBooking) {
        if (existingBooking) {
            if (existingBooking.status === 'blocked') {
                await supabase.from('bookings').delete().eq('id', existingBooking.id);
            } else {
                alert("這是客人的預約，請至儀表板取消訂單。");
                return;
            }
        } else {
            const { data: stores } = await supabase.from('stores').select('id').limit(1);
            await supabase.from('bookings').insert([{
                store_id: stores[0]?.id,
                staff_name: selectedStaff.name,
                booking_date: selectedDate,
                booking_time: time,
                status: 'blocked',
                customer_name: '休假/鎖定',
                service_name: '教練排休'
            }]);
        }
        fetchSchedule();
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-lg mb-6">排班與休假管理</h3>
            <div className="flex flex-col md:flex-row gap-6 mb-8">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">選擇日期</label>
                    <input type="date" className="p-3 border rounded-xl bg-gray-50" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}/>
                </div>
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-2">選擇人員</label>
                    <div className="flex space-x-2 overflow-x-auto pb-2">
                        {staffList.map(s => (
                            <button key={s.id} onClick={() => setSelectedStaff(s)} className={`flex items-center px-4 py-2 rounded-full border transition whitespace-nowrap ${selectedStaff?.id === s.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                                <img src={s.avatar} className="w-6 h-6 rounded-full mr-2 bg-gray-200" />
                                {s.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="border-t border-gray-100 pt-6">
                <h4 className="font-bold text-slate-700 mb-4 flex items-center">{selectedDate} 的時段狀態 {loading && <span className="ml-2 text-xs text-slate-400 font-normal">讀取中...</span>}</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {TIME_SLOTS.map(time => {
                        const booking = blockedSlots.find(b => b.booking_time === time);
                        const isCustomer = booking && booking.status !== 'blocked';
                        const isLeave = booking && booking.status === 'blocked';
                        return (
                            <button key={time} onClick={() => toggleSlot(time, booking)} className={`p-4 rounded-xl border text-center transition relative overflow-hidden group ${isCustomer ? 'bg-emerald-100 border-emerald-200 cursor-not-allowed' : isLeave ? 'bg-red-50 border-red-200' : 'bg-white hover:border-slate-400'}`}>
                                <div className="font-bold text-lg mb-1">{time}</div>
                                <div className={`text-xs font-bold ${isCustomer ? 'text-emerald-700' : isLeave ? 'text-red-500' : 'text-slate-400'}`}>{isCustomer ? '🟢 客戶預約' : isLeave ? '⛔ 休假中' : '⚪️ 可預約'}</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// --- 3. 課程服務管理 ---
function ServiceManager({ supabase }) {
    const [services, setServices] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ id: null, name: '', price: 1000, duration: 60, description: '', staff_ids: [] });

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
            const { error } = await supabase.from('services').update({ deleted_at: softDeleteDate.toISOString() }).eq('id', id);
            if (error) alert("軟刪除失敗，請檢查 DB 欄位");
        } else {
            await supabase.from('services').delete().eq('id', id);
        }
        fetchServices();
    }

    async function handleSubmit() {
        const { data: stores } = await supabase.from('stores').select('id').limit(1);
        const storeId = stores[0]?.id;
        const payload = { 
            name: formData.name, price: formData.price, duration: formData.duration, 
            description: formData.description, store_id: storeId,
            // staff_ids: formData.staff_ids 
        };
        let error;
        if (formData.id) error = (await supabase.from('services').update(payload).eq('id', formData.id)).error;
        else error = (await supabase.from('services').insert([payload])).error;

        if (!error) { setIsEditing(false); fetchServices(); } else alert("儲存失敗: " + error.message);
    }

    function openEdit(service = null) {
        setFormData(service ? { ...service, staff_ids: service.staff_ids || [] } : { id: null, name: '', price: 1000, duration: 60, description: '', staff_ids: [] });
        setIsEditing(true);
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg">課程服務管理</h3>
                <button onClick={() => openEdit()} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center"><Icon name="plus" size={16} className="mr-2"/> 新增課程</button>
            </div>
            {isEditing && (
                <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-emerald-200 shadow-inner">
                    <h4 className="font-bold text-lg text-emerald-800 mb-4">{formData.id ? '編輯課程' : '新增課程'}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div><label className="text-xs text-slate-500 font-bold">課程名稱</label><input className="w-full p-2 border rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                        <div><label className="text-xs text-slate-500 font-bold">價格 ($)</label><input type="number" className="w-full p-2 border rounded" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} /></div>
                        <div><label className="text-xs text-slate-500 font-bold">時長 (分鐘)</label><input type="number" className="w-full p-2 border rounded" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} /></div>
                        <div><label className="text-xs text-slate-500 font-bold">描述</label><input className="w-full p-2 border rounded" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                    </div>
                    {/* 人員綁定 UI 暫時保留，需後端欄位支援 */}
                    <div className="mb-4">
                        <label className="text-xs text-slate-500 font-bold mb-2 block">指派服務人員 (勾選)</label>
                        <div className="flex flex-wrap gap-2">
                            {staffList.map(staff => (
                                <label key={staff.id} className="flex items-center bg-white border px-3 py-2 rounded cursor-pointer hover:border-emerald-500">
                                    <input type="checkbox" className="mr-2 accent-emerald-600" 
                                        checked={formData.staff_ids.includes(staff.id)}
                                        onChange={e => {
                                            const newIds = e.target.checked 
                                                ? [...formData.staff_ids, staff.id] 
                                                : formData.staff_ids.filter(id => id !== staff.id);
                                            setFormData({...formData, staff_ids: newIds});
                                        }}
                                    />
                                    <span className="text-sm">{staff.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2 border-t border-gray-200 pt-4">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-500 hover:bg-gray-200 rounded">取消</button>
                        <button onClick={handleSubmit} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700">{formData.id ? '更新資料' : '確認新增'}</button>
                    </div>
                </div>
            )}
            <div className="space-y-3">
                {loading ? <div className="text-center text-slate-400 py-4">讀取中...</div> : 
                    services.map(s => (
                    <div key={s.id} className="flex justify-between items-center p-4 border border-gray-100 rounded-xl hover:border-emerald-200 transition bg-white">
                        <div><div className="font-bold text-slate-700 text-lg">{s.name}</div><div className="text-xs text-slate-400 flex items-center mt-1"><span className="bg-slate-100 px-2 py-0.5 rounded mr-2 text-slate-600">{s.duration} 分鐘</span><span className="font-mono font-bold text-emerald-600">${s.price}</span></div></div>
                        <div className="flex space-x-2">
                            <button onClick={() => openEdit(s)} className="text-blue-500 hover:bg-blue-50 p-2 rounded transition" title="編輯"><Icon name="edit" size={18}/></button>
                            <button onClick={() => handleDelete(s.id, s.name)} className="text-red-400 hover:bg-red-50 p-2 rounded transition" title="刪除"><Icon name="trash-2" size={18}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- 4. 人員管理 ---
function StaffManager({ supabase }) {
    const [staff, setStaff] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ id: null, name: '', title: '', avatar: '' });
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
            const { error } = await supabase.from('staff').update({ deleted_at: softDeleteDate.toISOString() }).eq('id', id);
            if (error) alert("軟刪除失敗");
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
        const payload = { name: formData.name, title: formData.title, store_id: storeId, avatar: finalAvatar, rating: 5.0 };

        let error;
        if (formData.id) error = (await supabase.from('staff').update(payload).eq('id', formData.id)).error;
        else error = (await supabase.from('staff').insert([payload])).error;
        
        if (!error) { setIsEditing(false); fetchStaff(); } else alert("儲存失敗: " + error.message);
    }

    function openEdit(person = null) {
        setFormData(person || { id: null, name: '', title: '', avatar: '' });
        setIsEditing(true);
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg">人員管理</h3>
                <button onClick={() => openEdit()} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center"><Icon name="plus" size={16} className="mr-2"/> 新增人員</button>
            </div>
            {isEditing && (
                <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-emerald-200 shadow-inner">
                    <h4 className="font-bold text-lg text-emerald-800 mb-4">{formData.id ? '編輯人員' : '新增人員'}</h4>
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden mb-2 border-4 border-white shadow-sm"><img src={formData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name || 'default'}`} className="w-full h-full object-cover" /></div>
                            <button onClick={() => fileInputRef.current.click()} className="text-xs bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded">上傳照片</button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                        </div>
                        <div className="flex-1 grid grid-cols-1 gap-4">
                            <div><label className="text-xs text-slate-500 font-bold">姓名</label><input className="w-full p-2 border rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                            <div><label className="text-xs text-slate-500 font-bold">職稱</label><input className="w-full p-2 border rounded" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4 border-t border-gray-200 pt-4">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-500 hover:bg-gray-200 rounded">取消</button>
                        <button onClick={handleSubmit} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700">{formData.id ? '更新資料' : '確認新增'}</button>
                    </div>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loading ? <div className="text-center text-slate-400 py-4 col-span-2">讀取中...</div> :
                    staff.map(s => (
                    <div key={s.id} className="flex items-center p-4 border border-gray-100 rounded-xl bg-white hover:border-emerald-200 transition">
                        <img src={s.avatar} className="w-12 h-12 rounded-full bg-gray-200 mr-4 object-cover" />
                        <div className="flex-1">
                            <div className="font-bold text-slate-700">{s.name}</div>
                            <div className="text-xs text-slate-400">{s.title}</div>
                        </div>
                        <div className="flex space-x-1">
                            <button onClick={() => openEdit(s)} className="text-blue-500 hover:bg-blue-50 p-2 rounded" title="編輯"><Icon name="edit" size={18}/></button>
                            <button onClick={() => handleDelete(s.id, s.name)} className="text-red-400 hover:bg-red-50 p-2 rounded" title="移除"><Icon name="trash-2" size={18}/></button>
                        </div>
                    </div>
                ))}
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
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-3xl">🧘‍♀️</div>
                    </div>
                    <h2 className="text-2xl font-bold text-center text-slate-800 mb-1">Amber Flow</h2>
                    <p className="text-center text-slate-500 text-sm mb-8">商家管理系統</p>
                    <div className="space-y-4">
                        <input type="text" value="admin" disabled className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-mono text-center" />
                        <input type="password" value="1234" disabled className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-mono text-center" />
                        <button onClick={() => setIsLoggedIn(true)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition shadow-lg active:scale-95 flex items-center justify-center mt-4">
                            登入系統 <Icon name="arrow-right" size={16} className="ml-2" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col md:flex-row">
            <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0">
                <div className="p-6 border-b border-slate-800 hidden md:block">
                    <h1 className="text-xl font-bold flex items-center"><span className="mr-2">🧘‍♀️</span> Amber Flow</h1>
                </div>
                <nav className="p-4 space-y-2 flex md:block overflow-x-auto md:overflow-visible">
                    <button onClick={() => setCurrentView('dashboard')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Icon name="layout-dashboard" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">儀表板</span>
                    </button>
                    <button onClick={() => setCurrentView('schedule')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'schedule' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Icon name="calendar-clock" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">排班休假</span>
                    </button>
                    <button onClick={() => setCurrentView('services')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'services' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Icon name="list" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">課程管理</span>
                    </button>
                    <button onClick={() => setCurrentView('staff')} className={`flex items-center p-3 rounded-lg w-full transition ${currentView === 'staff' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Icon name="users" className="mr-3 flex-shrink-0" /> <span className="whitespace-nowrap">人員管理</span>
                    </button>
                </nav>
                <div className="p-4 mt-auto border-t border-slate-800 hidden md:block">
                        <button onClick={() => setIsLoggedIn(false)} className="flex items-center text-slate-400 hover:text-white text-sm"><Icon name="log-out" size={16} className="mr-2" /> 登出</button>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto bg-gray-50 h-screen">
                <header className="bg-white border-b border-gray-200 p-6 flex justify-between items-center sticky top-0 z-10">
                    <h2 className="text-xl font-bold text-slate-800">
                        {currentView === 'dashboard' ? '今日概況' : currentView === 'schedule' ? '排班休假管理' : currentView === 'services' ? '服務項目設定' : '團隊成員設定'}
                    </h2>
                    <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs border-2 border-white shadow-sm">AM</div>
                    </div>
                </header>

                <div className="p-6 max-w-5xl mx-auto pb-20">
                    {currentView === 'dashboard' && <DashboardView supabase={supabaseClient} />}
                    {currentView === 'schedule' && <ScheduleManager supabase={supabaseClient} />}
                    {currentView === 'services' && <ServiceManager supabase={supabaseClient} />}
                    {currentView === 'staff' && <StaffManager supabase={supabaseClient} />}
                </div>
            </main>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AdminApp />);