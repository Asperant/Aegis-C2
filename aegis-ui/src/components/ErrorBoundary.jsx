import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { logger } from '../utils/logger';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        logger.error('UI runtime exception captured by ErrorBoundary.', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-mono text-red-500 p-8">
                    <ShieldAlert size={64} className="mb-6 animate-pulse" />
                    <h1 className="text-3xl font-black mb-4">SİSTEM ARAYÜZÜNDE KRİTİK HATA</h1>
                    <p className="text-slate-400 mb-6 text-center max-w-lg">
                        Arayüz bileşenlerinden biri beklenmeyen bir hata sebebiyle çöktü. Ancak ErrorBoundary sistemi tüm sayfanın çöküşünü önledi.
                    </p>
                    <div className="bg-slate-900 border border-red-900 p-4 rounded text-xs text-left w-full max-w-2xl overflow-auto text-red-400">
                        <code>{this.state.error?.toString()}</code>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-8 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white px-6 py-2 rounded transition-colors"
                    >
                        SİSTEMİ YENİDEN BAŞLAT
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
