export default function ChipSvg({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffe599" />
          <stop offset="50%" stopColor="#f1c232" />
          <stop offset="100%" stopColor="#e69138" />
        </linearGradient>
        <linearGradient id="fs" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M50,150 C50,100 150,80 250,100 C350,120 370,180 350,220 C330,260 200,280 100,250 C30,220 50,180 50,150 Z" fill="url(#cg)" stroke="#bf9000" strokeWidth="1" />
      <path d="M50,150 C80,120 200,100 300,130 C340,145 355,180 350,220 C250,180 100,180 50,150 Z" fill="url(#fs)" />
      <path d="M60,155 C120,125 250,120 330,150" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      <circle cx="120" cy="180" r="1" fill="#8e7cc3" opacity="0.6" />
      <circle cx="200" cy="160" r="1.2" fill="#e06666" opacity="0.5" />
      <circle cx="280" cy="190" r="1" fill="#783f04" opacity="0.4" />
      <circle cx="150" cy="220" r="0.8" fill="#783f04" opacity="0.4" />
      <circle cx="240" cy="230" r="1.1" fill="#bf9000" opacity="0.7" />
    </svg>
  );
}
