import svgPaths from "./svg-f1i1o2s4v1";

function Group() {
  return (
    <div className="relative size-full" data-name="Group">
      <svg className="block size-full" fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 667 354">
        <g id="Group">
          {/* Track outline - white stroke for visibility on dark backgrounds */}
          <path d={svgPaths.p2eaf1680} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" id="Vector" />
          <path d={svgPaths.pe884e80} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" id="Vector_2" />
        </g>
      </svg>
    </div>
  );
}

export default function NurburgringNordschleife1() {
  return (
    <div className="relative size-full" data-name="nurburgring_nordschleife 1">
      <div className="absolute flex inset-0 items-center justify-center">
        <div className="flex-none scale-y-[-100%] w-full h-full max-w-full max-h-full">
          <Group />
        </div>
      </div>
    </div>
  );
}