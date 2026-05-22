"use client";
import { cn } from "@/lib/utils";

export interface NeonPiggyBankProps {
  amount: string;
  currency: string;
  isAnimating?: boolean;
}

export function NeonPiggyBank({ amount, currency, isAnimating }: NeonPiggyBankProps) {
  return (
    <div className="relative w-full flex justify-center items-center py-8">
      <style>{`
        @keyframes dropCoin {
          0% { transform: translateY(-40px) scale(0.5); opacity: 0; }
          20% { transform: translateY(-10px) scale(1); opacity: 1; }
          70% { transform: translateY(30px) scale(1); opacity: 1; }
          100% { transform: translateY(50px) scale(0.5); opacity: 0; }
        }
        .golden-coin {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffe066 0%, #f5b041 50%, #d4ac0d 100%);
          border: 2px solid #fef9e7;
          box-shadow: 0 0 15px rgba(241, 196, 15, 0.8), inset 0 0 5px rgba(255, 255, 255, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9a7d0a;
          font-weight: bold;
          font-size: 12px;
          opacity: 0;
          z-index: 20;
        }
        .coin-inside {
          position: absolute;
          width: 28px;
          height: 10px;
          border-radius: 50%;
          background: linear-gradient(to bottom, #ffe066 0%, #f5b041 50%, #d4ac0d 100%);
          border: 1px solid rgba(255,255,255,0.6);
          border-bottom: 3px solid #b7950b;
          opacity: 0.65;
          box-shadow: 0 3px 5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.8);
        }
        .animate-coin-1 { animation: dropCoin 1.2s ease-in forwards; }
        .animate-coin-2 { animation: dropCoin 1.2s ease-in 0.3s forwards; }
        .animate-coin-3 { animation: dropCoin 1.2s ease-in 0.6s forwards; }
        .text-glow-pink {
          text-shadow: 0 0 5px #fff, 0 0 15px #ff87dd, 0 0 30px #ff87dd;
        }
      `}</style>
      <div className="relative w-full max-w-[320px] aspect-[4/3] flex items-center justify-center">
        {isAnimating && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 flex justify-center w-full h-full pointer-events-none">
            <div className="golden-coin animate-coin-1 left-[45%]">$</div>
            <div className="golden-coin animate-coin-2 left-[55%]">$</div>
            <div className="golden-coin animate-coin-3 left-[48%]">$</div>
          </div>
        )}
        <svg
          viewBox="0 0 240 180"
          className="w-full h-full absolute inset-0 z-0 drop-shadow-[0_15px_25px_rgba(0,0,0,0.5)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <filter id="neon-pink" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="glass-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
            </linearGradient>
            <radialGradient id="glass-highlight" cx="50%" cy="20%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g
            filter="url(#neon-pink)"
            stroke="#ff87dd"
            strokeWidth={isAnimating ? "5" : "3"}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-300 ease-out"
          >
            <path
              d="M 82 168 C 76 168 82 168 85 168 L 90 168 C 95 168 95 160 95 155 L 96 150"
              fill="url(#glass-fill)"
            />
            <path
              d="M 161 168 C 164 168 160 168 165 168 L 170 168 C 175 168 174 161 174 155 L 178 136"
              fill="url(#glass-fill)"
            />
            <path
              d="M 195 90 C 195 50 160 28 120 28 C 70 28 40 52 35 82 C 30 87 15 82 10 87 C 5 92 5 108 10 113 C 15 118 30 118 35 113 C 43 133 55 138 64 141 L 60 165 C 58 170 65 173 70 173 L 75 173 C 80 173 80 165 80 160 L 83 145 C 95 150 110 152 126 151 C 136 150 140 149 142 149 L 140 165 C 138 170 145 173 150 173 L 155 173 C 160 173 160 165 160 160 L 162 144 C 174 139 195 128 195 90 Z"
              fill="url(#glass-fill)"
            />
            <ellipse cx="12" cy="98" rx="5" ry="12" fill="none" />
            <circle cx="12" cy="94" r="1.5" fill="#ff87dd" />
            <circle cx="12" cy="102" r="1.5" fill="#ff87dd" />
            <path
              d="M 60 42 C 55 30 45 20 35 25 C 30 28 35 40 45 55"
              fill="url(#glass-fill)"
            />
            <path
              d="M 195 80 C 210 70 224 85 215 95 C 207 105 193 95 204 87"
              fill="none"
            />
            <line x1="100" y1="37" x2="140" y2="37" strokeWidth="4" />
          </g>
          <ellipse
            cx="120"
            cy="50"
            rx="40"
            ry="15"
            fill="url(#glass-highlight)"
            filter="blur(3px)"
          />
        </svg>
        <div className="absolute inset-0 z-[1] pointer-events-none">
          <div className="coin-inside absolute left-[38%] top-[77%] -rotate-6" />
          <div className="coin-inside absolute left-[48%] top-[78%] rotate-3" />
          <div className="coin-inside absolute left-[56%] top-[76%] rotate-12" />
          <div className="coin-inside absolute left-[43%] top-[73%] rotate-6" />
          <div className="coin-inside absolute left-[52%] top-[74%] -rotate-3" />
          <div className="coin-inside absolute left-[47%] top-[70%] rotate-2" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 pr-4 z-10 pointer-events-none">
          <p className="text-[10px] text-white/60 uppercase tracking-widest mb-0.5">
            Pozo Acumulado
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-medium text-[#ff107a]">{currency}</span>
            <span
              className={cn(
                "font-display text-4xl text-white tabular-nums tracking-tight",
                "text-glow-pink transition-all duration-300",
                isAnimating && "scale-110",
              )}
            >
              {amount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
