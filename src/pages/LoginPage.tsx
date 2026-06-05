// src/pages/LoginPage.tsx
// VIKRR — Asset Shield — Přihlášení PIN kódem

import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { isSandboxLoginEnabled } from '../lib/firebase';
import { Shield, Delete, LogIn } from 'lucide-react';
import appConfig from '../appConfig';

export default function LoginPage() {
  const { login } = useAuthContext();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(false);

      // Auto-submit at full length (6); 4–5 confirm via button
      if (newPin.length === 6) {
        handleLogin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleLogin = async (pinToUse: string) => {
    setIsLoading(true);
    const success = await login(pinToUse);
    setIsLoading(false);
    
    if (!success) {
      setError(true);
      setPin('');
      // Vibrate on error (if supported)
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      
      {/* Logo */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-[#1e3a5f] to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Shield className="w-9 h-9 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight text-white">{appConfig.BRAND_NAME}</h1>
          <p className="text-blue-400/80 text-[10px] font-medium tracking-widest uppercase">{appConfig.PRODUCT_NAME_SHORT}</p>
        </div>
      </div>

      {/* PIN Display */}
      <div className="mb-8">
        <div className="flex gap-2 mb-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                error
                  ? 'border-red-500 bg-red-500/20 animate-shake'
                  : pin.length > i
                    ? 'border-blue-500 bg-blue-500/20 text-white'
                    : 'border-slate-600 bg-slate-800'
              }`}
            >
              {pin.length > i ? '●' : ''}
            </div>
          ))}
        </div>
        {error && (
          <p className="text-red-500 text-center text-sm animate-pulse">Nesprávný PIN</p>
        )}
        {!error && (
          <p className="text-slate-400 text-center text-xs">PIN má 4 až 6 číslic</p>
        )}
        {isSandboxLoginEnabled && !error && (
          <p className="text-blue-300 text-center text-xs mt-1">Demo režim: PIN 0000</p>
        )}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
          if (key === '') return <div key="empty" />;
          if (key === 'del') {
            return (
              <button
                key="del"
                onClick={handleDelete}
                disabled={pin.length === 0 || isLoading}
                className="w-20 h-16 rounded-xl bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 active:scale-95 transition disabled:opacity-30"
              >
                <Delete className="w-6 h-6" />
              </button>
            );
          }
          return (
            <button
              key={key}
              onClick={() => handleDigit(key)}
              disabled={isLoading}
              className="w-20 h-16 rounded-xl bg-slate-800 border border-slate-700 text-white text-2xl font-bold hover:bg-slate-700 active:scale-95 active:bg-blue-600 transition disabled:opacity-50"
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Submit (pro 4–5místné PINy; 6místný se odešle sám) */}
      <button
        onClick={() => handleLogin(pin)}
        disabled={pin.length < 4 || isLoading}
        className="mt-5 w-full max-w-xs h-14 rounded-xl bg-blue-600 text-white text-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-500 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <LogIn className="w-5 h-5" />
        Přihlásit
      </button>

      {/* Loading */}
      {isLoading && (
        <div className="mt-6 flex items-center gap-2 text-blue-400">
          <LogIn className="w-5 h-5 animate-pulse" />
          <span>Přihlašuji...</span>
        </div>
      )}

      {/* CSS for shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
