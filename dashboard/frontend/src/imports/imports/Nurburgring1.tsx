import svgPaths from "./svg-p539i6altb";

function Group() {
  return (
    <div className="relative size-full" data-name="Group">
      <svg className="block size-full" fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1335 1335">
        <g id="Group">
          {/* Track outline - white for visibility on dark backgrounds */}
          <path d={svgPaths.p22a86e00} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="3" id="Vector" />
          <path d={svgPaths.p2c53b600} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.6)" strokeWidth="2" id="Vector_2" />
          <path d={svgPaths.p10bef800} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.6)" strokeWidth="2" id="Vector_3" />
          <path d={svgPaths.p2d091200} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.6)" strokeWidth="2" id="Vector_4" />
        </g>
      </svg>
    </div>
  );
}

export default function Nurburgring1() {
  return (
    <div className="relative size-full" data-name="nurburgring 1">
      <div className="absolute flex inset-0 items-center justify-center">
        <div className="flex-none scale-y-[-100%] w-full h-full max-w-full max-h-full">
          <Group />
        </div>
      </div>
    </div>
  );
}