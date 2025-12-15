const { useState, useEffect, useRef } = React;

// ★ Supabase 設定 (請確認 URL/Key 與 admin.html 一致)
const supabaseUrl = 'https://kwvbhzjzysmivafsvwng.supabase.co';
const supabaseKey = 'sb_publishable_7RUbenk2kXNDmvuo1XtHbQ_m0RjXuZr'; 
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

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

// --- 店家管理組件 (含新增/編輯功能) ---
function StoresManager({ supabase }) {
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Modal 狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ 
        id: null, name: '', address: '', username: '', password: '', valid_until: '' 
    });

    useEffect(() => { fetchStores(); }, []);

    async function fetchStores() {
        setLoading(true);
        // 抓取店家資料 (依建立時間排序)
        const { data, error } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
        if (data) setStores(data);
        setLoading(false);
    }

    // 開啟編輯/新增視窗
    const openModal = (store = null) => {
        if (store) {
            // 編輯模式
            setFormData({ 
                id: store.id, 
                name: store.name, 
                address: store.address, 
                username: store.username, 
                password: store.password, // 顯示目前密碼方便修改
                valid_until: store.valid_until || new Date().toISOString().split('T')[0]
            });
        } else {
            // 新增模式 (預設給 30 天效期)
            const nextMonth = new Date();
            nextMonth.setDate(nextMonth.getDate() + 30);
            
            // 預設一組強密碼避免瀏覽器警告
            const randomPass = 'Easy@' + Math.floor(1000 + Math.random() * 9000);
            
            setFormData({ 
                id: null, name: '', address: '', username: '', 
                password: randomPass, 
                valid_until: nextMonth.toISOString().split('T')[0]
            });
        }
        setIsModalOpen(true);
    };

    // 儲存店家資料
    const handleSave = async () => {
        if (!formData.name || !formData.username || !formData.password) {
            return alert("請填寫完整資訊 (店名、帳號、密碼為必填)");
        }

        const payload = {
            name: formData.name,
            address: formData.address,
            username: formData.username,
            password: formData.password,
            valid_until: formData.valid_until
        };

        try {
            let error;
            if (formData.id) {
                // 更新
                const res = await supabase.from('stores').update(payload).eq('id', formData.id);
                error = res.error;
            } else {
                // 新增
                const res = await supabase.from('stores').insert([payload]);
                error = res.error;
            }

            if (error) throw error;

            alert(formData.id ? "更新成功！" : "新增成功！");
            setIsModalOpen(false);
            fetchStores(); // 重新整理列表
        } catch (err) {
            alert("儲存失敗: " + err.message);
        }
    };

    // 檢查是否過期
    const isExpired = (dateStr) => {
        if (!dateStr) return false;
        return new Date(dateStr) < new Date(new Date().toISOString().split('T')[0]); // 只比對日期
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-slate-700">平台店家列表</h3>
                <button onClick={() => openModal()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center transition shadow-lg active:scale-95">
                    <Icon name="plus" size={16} className="mr-2"/> 新增店家
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-indigo-50 text-indigo-900 text-xs uppercase">
                        <tr>
                            <th className="p-3 rounded-l-lg">店名 / ID</th>
                            <th className="p-3">登入資訊</th>
                            <th className="p-3">授權效期</th>
                            <th className="p-3">狀態</th>
                            <th className="p-3 rounded-r-lg text-right">管理</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? <tr><td colSpan="5" className="p-8 text-center text-slate-400">載入中...</td></tr> : stores.map(store => {
                            const expired = isExpired(store.valid_until);
                            return (
                                <tr key={store.id} className="hover:bg-indigo-50/30 transition">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800 text-base">{store.name}</div>
                                        <div className="font-mono text-xs text-gray-400 mt-1 select-all">{store.id}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center text-xs text-slate-600 mb-1"><Icon name="user" size={12} className="mr-1"/> {store.username}</div>
                                        <div className="flex items-center text-xs text-slate-400"><Icon name="lock" size={12} className="mr-1"/> {store.password}</div>
                                    </td>
                                    <td className="p-4 font-mono text-slate-600">
                                        {store.valid_until || '無期限'}
                                    </td>
                                    <td className="p-4">
                                        {expired ? 
                                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><Icon name="alert-circle" size={12} className="mr-1"/> 已過期</span> : 
                                            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center w-fit"><Icon name="check-circle" size={12} className="mr-1"/> 授權中</span>
                                        }
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => openModal(store)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded transition font-bold text-xs border border-indigo-200">
                                            編輯 / 續約
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 新增/編輯 Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="text-xl font-bold text-slate-800">{formData.id ? '編輯店家授權' : '新增合作店家'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><Icon name="x" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">店名</label>
                                <input className="w-full p-3 border rounded-xl bg-slate-50" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="例如：快樂瑜珈" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">地址</label>
                                <input className="w-full p-3 border rounded-xl bg-slate-50" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">管理員帳號</label>
                                    <input className="w-full p-3 border rounded-xl bg-slate-50" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">管理員密碼</label>
                                    <input className="w-full p-3 border rounded-xl bg-slate-50" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                                </div>
                            </div>
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                <label className="block text-xs font-bold text-indigo-800 mb-1">授權有效期限 (Valid Until)</label>
                                <input type="date" className="w-full p-3 border border-indigo-200 rounded-xl font-bold text-indigo-900" value={formData.valid_until} onChange={e => setFormData({...formData, valid_until: e.target.value})} />
                                <p className="text-[10px] text-indigo-400 mt-2">※ 若日期早於今日，該店家將無法登入後台。</p>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-6 border-t border-gray-100 mt-4">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-3 text-slate-500 hover:bg-slate-100 rounded-xl font-bold">取消</button>
                            <button onClick={handleSave} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg active:scale-95 transition">
                                確認儲存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- 超級管理員主程式 ---
function SuperAdminApp() {
    // 權限檢查
    useEffect(() => {
        const role = sessionStorage.getItem('amber_role');
        if (role !== 'super_admin') {
            alert('權限不足，請重新登入');
            window.location.href = 'admin.html';
        }
    }, []);

    const handleLogout = () => {
        sessionStorage.removeItem('amber_role');
        window.location.href = 'admin.html';
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Top Bar */}
            <header className="bg-indigo-900 text-white p-4 shadow-md sticky top-0 z-10">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center shadow-inner">
                            <Icon name="layout-dashboard" size={24} className="text-indigo-100" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg leading-tight">EasyBook <span className="text-indigo-300 font-normal">Platform</span></h1>
                            <p className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold">Super Admin Console</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="bg-indigo-800 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center transition">
                        <Icon name="log-out" size={16} className="mr-2"/> 登出
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6">
                <div className="max-w-5xl mx-auto">
                    {/* 數據概況 (模擬數據，未來可從 DB 統計) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100">
                            <p className="text-xs font-bold text-indigo-300 uppercase mb-2">Total Merchants</p>
                            <h2 className="text-4xl font-black text-slate-800">1</h2>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100">
                            <p className="text-xs font-bold text-indigo-300 uppercase mb-2">Active Subscriptions</p>
                            <h2 className="text-4xl font-black text-emerald-500">1</h2>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100">
                            <p className="text-xs font-bold text-indigo-300 uppercase mb-2">Monthly Revenue</p>
                            <h2 className="text-4xl font-black text-slate-800">$0</h2>
                        </div>
                    </div>

                    {/* 店家列表 */}
                    <StoresManager supabase={supabaseClient} />
                </div>
            </main>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SuperAdminApp />);