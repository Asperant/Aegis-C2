import { useState } from 'react';
import { ShieldAlert, Terminal, Lock } from 'lucide-react';
import { API_ENDPOINTS } from '../constants';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.LOGIN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const responseText = await response.text();
            let data = {};
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch {
                data = {};
            }

            const token = data.token || data.Token;

            if (response.ok && token) {
                localStorage.setItem('aegis_token', token);
                // Redirect to dashboard; SignalR connection starts there.
                window.location.href = '/';
            } else {
                setError(data.message || data.Message || `Yetkilendirme reddedildi (HTTP ${response.status})`);
            }
        } catch {
            setError('GKS Komuta Merkezine bağlanılamadı.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center font-mono text-slate-200">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>

            <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 shadow-2xl rounded-sm z-10 relative overflow-hidden">

                {/* Decorative accent lines */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-500"></div>
                <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-emerald-600/50 to-transparent"></div>

                <div className="flex flex-col items-center mb-8">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-full mb-4">
                        <ShieldAlert size={48} className="text-emerald-500" />
                    </div>
                    <h1 className="text-3xl font-black tracking-widest text-center">
                        AEGIS <span className="text-emerald-500">C2</span>
                    </h1>
                    <p className="text-slate-500 text-xs mt-2 tracking-widest">ASKERİ KOMUTA KONTROL AĞI</p>
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-950/50 border border-red-900 text-red-400 text-sm flex items-center justify-center font-bold">
                        [ GIRIS HATASI ]: {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 tracking-wider flex items-center gap-2">
                            <Terminal size={14} /> KULLANICI KİMLİĞİ
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 p-3 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                            placeholder="GKS-X9ID..."
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 tracking-wider flex items-center gap-2">
                            <Lock size={14} /> GÜVENLİK ANAHTARI
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 p-3 text-emerald-500 focus:outline-none focus:border-emerald-500 transition-colors tracking-widest"
                            placeholder="••••••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black p-3 tracking-widest transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                    >
                        {loading ? 'DOGRULANIYOR...' : 'SİSTEME GİRİŞ YAP'}
                    </button>
                    <div className="text-[10px] text-slate-500 text-center break-all">
                        API: {API_ENDPOINTS.LOGIN}
                    </div>
                </form>

            </div>
        </div>
    );
}
