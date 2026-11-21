import React, { useEffect, useMemo, useRef, useState } from 'react';

export type MouthViseme = 'rest' | 'closed_mbp' | 'e_ih' | 'ah_open' | 'oh_round' | 'fv_bite';

interface AiNewsAnchorProps {
  isSpeaking: boolean;
  isBreaking?: boolean;
  spokenWord?: string;
  spokenScript?: string;
  anchorName?: string;
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

function charToViseme(word: string, phase: number): MouthViseme {
  if (!word) return 'rest';
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 'rest';
  const ch = clean[phase % clean.length];
  if ('mbp'.includes(ch)) return 'closed_mbp';
  if ('fv'.includes(ch)) return 'fv_bite';
  if ('ouqw'.includes(ch)) return 'oh_round';
  if ('eiystzd'.includes(ch)) return 'e_ih';
  return 'ah_open';
}

export const AiNewsAnchor: React.FC<AiNewsAnchorProps> = ({
  isSpeaking,
  isBreaking = false,
  spokenWord = '',
  spokenScript = '',
  anchorName = 'ARJUN VERMA · CHIEF MARKETS ANCHOR',
  sentiment = 'NEUTRAL',
}) => {
  const [viseme, setViseme] = useState<MouthViseme>('rest');
  const [blink, setBlink] = useState(false);
  const [headTilt, setHeadTilt] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([0.2, 0.2, 0.2, 0.2, 0.2]);
  const [fallbackWord, setFallbackWord] = useState<string>('');
  const phaseRef = useRef(0);
  const wordIdxRef = useRef(0);

  const scriptWords = useMemo(() => {
    return spokenScript
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Za-z0-9₹%.+-]/g, ''))
      .filter(Boolean);
  }, [spokenScript]);

  // Reset fallback word index whenever script changes or speech stops
  useEffect(() => {
    wordIdxRef.current = 0;
    if (!isSpeaking) {
      setFallbackWord('');
    }
  }, [isSpeaking, spokenScript]);

  // Natural eye blinking every 3-5 seconds
  useEffect(() => {
    let timeoutId: number;
    const scheduleBlink = () => {
      const delay = 2800 + Math.random() * 2400;
      timeoutId = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 140);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => window.clearTimeout(timeoutId);
  }, []);

  const activeWord = spokenWord || fallbackWord;
  const activeWordRef = useRef(activeWord);
  activeWordRef.current = activeWord;

  // Separate smooth fallback word cadence when browser voice omits onboundary
  useEffect(() => {
    if (!isSpeaking || spokenWord || scriptWords.length === 0) return;
    setFallbackWord(scriptWords[wordIdxRef.current % scriptWords.length] || '');
    const wordTimer = window.setInterval(() => {
      wordIdxRef.current += 1;
      setFallbackWord(scriptWords[wordIdxRef.current % scriptWords.length] || '');
    }, 320);
    return () => window.clearInterval(wordTimer);
  }, [isSpeaking, spokenWord, scriptWords]);

  // Real-time lip-sync + head cadence while speaking
  useEffect(() => {
    if (!isSpeaking) {
      setViseme('rest');
      setHeadTilt(0);
      setAudioLevels([0.15, 0.15, 0.15, 0.15, 0.15]);
      return;
    }

    const lipTimer = window.setInterval(() => {
      phaseRef.current += 1;
      const cycle: MouthViseme[] = [
        'ah_open',
        'e_ih',
        'closed_mbp',
        'oh_round',
        'ah_open',
        'fv_bite',
        'e_ih',
      ];
      const currentTarget = activeWordRef.current;
      const nextViseme = currentTarget
        ? charToViseme(currentTarget, phaseRef.current)
        : cycle[phaseRef.current % cycle.length];

      setViseme(nextViseme);
      setHeadTilt(Math.sin(phaseRef.current * 0.42) * 1.35);
      setAudioLevels([
        0.3 + Math.random() * 0.65,
        0.4 + Math.random() * 0.6,
        0.5 + Math.random() * 0.5,
        0.35 + Math.random() * 0.65,
        0.25 + Math.random() * 0.6,
      ]);
    }, 110);

    return () => window.clearInterval(lipTimer);
  }, [isSpeaking]);

  const renderMouth = () => {
    switch (viseme) {
      case 'closed_mbp':
        return (
          <g>
            <path
              d="M 134 146 Q 150 148 166 146"
              stroke="#6b2e26"
              strokeWidth="2.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 139 149 Q 150 152 161 149"
              stroke="#9c5143"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
      case 'fv_bite':
        return (
          <g>
            <path
              d="M 135 144 Q 150 146 165 144 L 162 149 Q 150 151 138 149 Z"
              fill="#3d1512"
            />
            <path d="M 137 144 Q 150 145 163 144 L 162 146.5 L 138 146.5 Z" fill="#f8fafc" />
          </g>
        );
      case 'e_ih':
        return (
          <g>
            <path
              d="M 132 144 Q 150 141 168 144 Q 165 152 150 152 Q 135 152 132 144 Z"
              fill="#421412"
              stroke="#7b382f"
              strokeWidth="1.4"
            />
            <path d="M 136 144 Q 150 142 164 144 L 162 146.5 L 138 146.5 Z" fill="#f8fafc" />
            <path d="M 141 149 Q 150 148 159 149 Q 155 151.5 145 151.5 Z" fill="#c05c56" />
          </g>
        );
      case 'oh_round':
        return (
          <g>
            <ellipse
              cx="150"
              cy="148"
              rx="8.5"
              ry="7"
              fill="#38110f"
              stroke="#7b382f"
              strokeWidth="1.6"
            />
            <ellipse cx="150" cy="151.5" rx="4.5" ry="2.2" fill="#b4534d" />
          </g>
        );
      case 'ah_open':
        return (
          <g>
            <path
              d="M 134 143 Q 150 141 166 143 Q 165 156 150 156 Q 135 156 134 143 Z"
              fill="#38110f"
              stroke="#7b382f"
              strokeWidth="1.4"
            />
            <path d="M 137 143 Q 150 142 163 143 L 161 146.2 L 139 146.2 Z" fill="#f8fafc" />
            <path d="M 141 151 Q 150 149.5 159 151 Q 156 155 144 155 Z" fill="#b95650" />
          </g>
        );
      case 'rest':
      default:
        return (
          <g>
            <path
              d="M 134 145 Q 150 149 166 145"
              stroke="#7b382f"
              strokeWidth="2.3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 140 150 Q 150 152 160 150"
              stroke="#b47566"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
    }
  };

  const accentGlow =
    sentiment === 'POSITIVE'
      ? '#16a34a'
      : sentiment === 'NEGATIVE'
        ? '#dc2626'
        : '#0284c7';

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-slate-700/90 bg-gradient-to-b from-[#091a38] via-[#0b2046] to-[#060f22] flex flex-col justify-between select-none">
      {/* Top Broadcast Bug & Equalizer */}
      <div className="relative z-10 flex items-center justify-between px-2 pt-1.5 gap-1 shrink-0">
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold font-mono-num tracking-wide truncate ${
            isSpeaking
              ? 'bg-red-600 text-white'
              : isBreaking
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800/90 text-slate-300 border border-slate-700'
          }`}
        >
          {isSpeaking ? 'ON AIR' : 'AI DESK'}
        </span>

        <div className="flex items-end gap-0.5 h-3.5 px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 shrink-0">
          {audioLevels.map((lvl, i) => (
            <span
              key={i}
              className={`w-0.5 sm:w-1 rounded-full transition-all duration-75 ${
                isSpeaking ? 'bg-sky-400' : 'bg-slate-600'
              }`}
              style={{ height: `${Math.round(lvl * 100)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Studio Backdrop + Animated AI Male Anchor SVG */}
      <div className="relative flex-1 min-h-0 flex items-end justify-center overflow-hidden">
        <svg
          viewBox="0 0 300 245"
          className="w-full h-full"
          preserveAspectRatio="xMidYMax meet"
          role="img"
          aria-label="NWS AI Male Business News Anchor"
        >
          <defs>
            <radialGradient id="studioKeyLight" cx="50%" cy="40%" r="58%">
              <stop offset="0%" stopColor={accentGlow} stopOpacity="0.28" />
              <stop offset="100%" stopColor="#060f22" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d49c78" />
              <stop offset="100%" stopColor="#b97d58" />
            </linearGradient>
            <linearGradient id="suitGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#162844" />
              <stop offset="100%" stopColor="#0b1526" />
            </linearGradient>
          </defs>

          <rect width="300" height="245" fill="url(#studioKeyLight)" />

          {/* Studio Wall Architectural Lines & Background Data Screens */}
          <g opacity="0.34">
            <rect x="14" y="18" width="66" height="42" rx="3" fill="#071329" stroke="#1e40af" strokeWidth="1" />
            <polyline points="20,48 32,40 44,44 58,28 74,32" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
            <rect x="220" y="18" width="66" height="42" rx="3" fill="#071329" stroke="#1e40af" strokeWidth="1" />
            <polyline points="226,34 240,40 254,28 268,36 280,24" fill="none" stroke="#4ade80" strokeWidth="1.5" />
            <line x1="0" y1="184" x2="300" y2="184" stroke="#1e3a8a" strokeWidth="1" />
          </g>

          {/* Torso & Tailored Navy Suit */}
          <g transform={`translate(0, ${isSpeaking ? Math.sin(headTilt) * 1.1 : 0})`}>
            <path
              d="M 52 245 C 56 196 82 178 114 172 L 186 172 C 218 178 244 196 248 245 Z"
              fill="url(#suitGrad)"
              stroke="#233b63"
              strokeWidth="1.2"
            />
            <polygon points="124,170 176,170 150,234" fill="#f1f5f9" />
            <polygon points="122,170 138,172 146,188 126,184" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" />
            <polygon points="178,170 162,172 154,188 174,184" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" />

            <polygon points="145,180 155,180 153,191 147,191" fill="#991b1b" />
            <polygon points="147,191 153,191 157,232 150,242 143,232" fill="#b91c1c" />
            <polygon points="149,191 153,191 156,228 150,236" fill="#dc2626" opacity="0.45" />

            <polygon points="114,172 126,170 146,238 122,218" fill="#1e3356" />
            <polygon points="186,172 174,170 154,238 178,218" fill="#1e3356" />

            <circle cx="171" cy="206" r="2.6" fill="#0f172a" stroke="#94a3b8" strokeWidth="0.8" />
            <line x1="171" y1="208.6" x2="173" y2="219" stroke="#334155" strokeWidth="1" />

            <path d="M 133 150 L 133 174 Q 150 182 167 174 L 167 150 Z" fill="#b57a55" />
            <path d="M 133 156 Q 150 170 167 156 L 167 150 L 133 150 Z" fill="#935d3c" opacity="0.55" />
          </g>

          {/* Head Group */}
          <g transform={`rotate(${headTilt.toFixed(2)}, 150, 162)`}>
            <ellipse cx="105" cy="114" rx="7" ry="13" fill="#be835d" />
            <ellipse cx="195" cy="114" rx="7" ry="13" fill="#be835d" />

            <path
              d="M 107 94 C 107 60 193 60 193 94 L 191 126 C 190 147 170 165 150 166 C 130 165 110 147 109 126 Z"
              fill="url(#skinGrad)"
            />

            <path
              d="M 110 122 C 112 144 130 163 150 164 C 170 163 188 144 190 122 C 185 140 169 154 150 155 C 131 154 115 140 110 122 Z"
              fill="#4a3123"
              opacity="0.2"
            />

            <path
              d="M 105 102 C 102 66 118 44 150 44 C 182 44 198 66 195 102 C 191 82 180 72 166 70 C 154 68 138 72 126 76 C 115 80 108 90 105 102 Z"
              fill="#171923"
            />
            <path
              d="M 122 56 C 142 48 172 50 186 66 C 168 60 144 61 122 66 Z"
              fill="#2d3347"
              opacity="0.5"
            />

            <path
              d={isSpeaking ? 'M 121 96 Q 131 91 141 95' : 'M 121 97 Q 131 93 141 96'}
              stroke="#1e1b18"
              strokeWidth="3.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={isSpeaking ? 'M 159 95 Q 169 91 179 96' : 'M 159 96 Q 169 93 179 97'}
              stroke="#1e1b18"
              strokeWidth="3.6"
              strokeLinecap="round"
              fill="none"
            />

            {blink ? (
              <g>
                <path d="M 123 107 Q 131 110 139 107" stroke="#2d1d15" strokeWidth="2.2" fill="none" />
                <path d="M 161 107 Q 169 110 177 107" stroke="#2d1d15" strokeWidth="2.2" fill="none" />
              </g>
            ) : (
              <g>
                <ellipse cx="131" cy="107" rx="7.5" ry="4.5" fill="#ffffff" />
                <circle cx="131.5" cy="107" r="3.2" fill="#1e1714" />
                <circle cx="132.5" cy="106" r="1" fill="#ffffff" />

                <ellipse cx="169" cy="107" rx="7.5" ry="4.5" fill="#ffffff" />
                <circle cx="168.5" cy="107" r="3.2" fill="#1e1714" />
                <circle cx="169.5" cy="106" r="1" fill="#ffffff" />
              </g>
            )}

            <path
              d="M 150 104 L 147 126 Q 150 130 155 127"
              stroke="#9a6242"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />

            {renderMouth()}
          </g>

          {/* Studio Desk Foreground Edge */}
          <rect x="0" y="232" width="300" height="13" fill="#081226" />
          <line x1="0" y1="232" x2="300" y2="232" stroke="#38bdf8" strokeWidth="1.5" opacity="0.6" />
        </svg>
      </div>

      {/* Bottom Broadcast Lower-Third Nameplate */}
      <div className="relative z-10 bg-black/85 px-2 py-1.5 border-t border-slate-800/90 shrink-0">
        <div className="text-[9px] sm:text-[10px] font-bold text-white tracking-wide truncate">
          {anchorName}
        </div>
        {isSpeaking && activeWord ? (
          <div className="text-[9px] sm:text-[10px] font-mono-num text-sky-300 truncate">
            Speaking: &ldquo;{activeWord}&rdquo;
          </div>
        ) : (
          <div className="text-[9px] sm:text-[10px] text-slate-400 truncate hidden sm:block">
            NWS Market Broadcast Studio
          </div>
        )}
      </div>
    </div>
  );
};
