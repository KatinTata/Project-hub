export default function BrainAnimation({ opacity = 0.35, fullscreen = false }) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      opacity,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        .brain-network-lines {
          stroke-dasharray: 1500;
          stroke-dashoffset: 1500;
          animation: brainDrawLines 10s ease-in-out infinite alternate;
        }
        .brain-nodes circle {
          animation: brainPulseNode 3s infinite alternate;
          opacity: 0.5;
        }
        .brain-nodes circle:nth-child(odd) {
          animation-delay: 1s;
          animation-duration: 4s;
        }
        .brain-nodes circle:nth-child(3n) {
          animation-delay: 2s;
          animation-duration: 3.5s;
        }
        @keyframes brainDrawLines {
          0%   { stroke-dashoffset: 1500; opacity: 0.2; }
          50%  { opacity: 0.9; }
          100% { stroke-dashoffset: 0; opacity: 0.7; }
        }
        @keyframes brainPulseNode {
          0%   { opacity: 0.3; transform: scale(0.9); }
          100% { opacity: 0.8; transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .brain-network-lines, .brain-nodes circle, .brain-particle {
            animation: none !important;
          }
        }
      `}</style>

      <svg
        viewBox="0 0 150 140"
        xmlns="http://www.w3.org/2000/svg"
        style={fullscreen
          ? { width: '100%', height: '100%', overflow: 'visible' }
          : { width: 'min(80vmin, 600px)', height: 'auto', overflow: 'visible' }
        }
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="brainBlueGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="brainLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#4facfe" stopOpacity="0.8" />
            <stop offset="50%"  stopColor="#e0f2fe" stopOpacity="1" />
            <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.8" />
          </linearGradient>

          <path id="brainMesh" d="
            M 5 60 L 25 30 L 45 15 L 75 10 L 105 15 L 130 35 L 145 60 L 140 90 L 120 110 L 95 125 L 85 105 L 55 95 L 35 100 L 15 85 Z
            M 5 60 L 25 60 L 25 30
            M 25 60 L 45 40 L 45 15
            M 45 40 L 75 45 L 75 10
            M 75 45 L 105 50 L 105 15
            M 105 50 L 130 35
            M 105 50 L 120 70 L 145 60
            M 120 70 L 140 90
            M 120 70 L 95 80 L 120 110
            M 95 80 L 95 125
            M 95 80 L 85 105
            M 95 80 L 75 80 L 75 45
            M 75 80 L 85 105
            M 75 80 L 50 70 L 45 40
            M 50 70 L 75 45
            M 50 70 L 55 95
            M 50 70 L 35 80 L 25 60
            M 35 80 L 35 100
            M 35 80 L 15 85
            M 25 30 L 45 40
          " />
        </defs>

        <use
          href="#brainMesh"
          className="brain-network-lines"
          fill="none"
          stroke="url(#brainLineGrad)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          filter="url(#brainBlueGlow)"
        />

        <g className="brain-nodes" fill="#ffffff" filter="url(#brainBlueGlow)" style={{ transformOrigin: 'center' }}>
          <circle cx="5"   cy="60"  r="0.8" />
          <circle cx="25"  cy="30"  r="0.8" />
          <circle cx="45"  cy="15"  r="0.8" />
          <circle cx="75"  cy="10"  r="0.8" />
          <circle cx="105" cy="15"  r="0.8" />
          <circle cx="130" cy="35"  r="0.8" />
          <circle cx="145" cy="60"  r="0.8" />
          <circle cx="140" cy="90"  r="0.8" />
          <circle cx="120" cy="110" r="0.8" />
          <circle cx="95"  cy="125" r="0.8" />
          <circle cx="85"  cy="105" r="0.8" />
          <circle cx="55"  cy="95"  r="0.8" />
          <circle cx="35"  cy="100" r="0.8" />
          <circle cx="15"  cy="85"  r="0.8" />

          <circle cx="25"  cy="60"  r="1" />
          <circle cx="45"  cy="40"  r="1" />
          <circle cx="75"  cy="45"  r="1" />
          <circle cx="105" cy="50"  r="1" />
          <circle cx="120" cy="70"  r="1" />
          <circle cx="95"  cy="80"  r="1" />
          <circle cx="75"  cy="80"  r="1" />
          <circle cx="50"  cy="70"  r="1" />
          <circle cx="35"  cy="80"  r="1" />
        </g>

        <g filter="url(#brainBlueGlow)">
          <circle className="brain-particle" r="0.6" fill="#ffffff" opacity="0.8">
            <animateMotion dur="6s" repeatCount="indefinite" path="M 5 60 L 25 60 L 45 40 L 75 45 L 105 50 L 130 35" />
          </circle>
          <circle className="brain-particle" r="0.5" fill="#4facfe" opacity="0.8">
            <animateMotion dur="4s" repeatCount="indefinite" path="M 75 10 L 75 45 L 50 70 L 55 95 L 35 100" />
          </circle>
          <circle className="brain-particle" r="0.7" fill="#e0f2fe" opacity="0.8">
            <animateMotion dur="8s" repeatCount="indefinite" path="M 145 60 L 120 70 L 95 80 L 85 105 L 95 125" />
          </circle>
        </g>
      </svg>
    </div>
  )
}
