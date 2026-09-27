import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Stop,
  Filter,
  FeGaussianBlur,
} from "react-native-svg";
export default function Blur() {
  return (
    <Svg
      height="500"
      width="500"
      style={{ position: "absolute", top: -100, left: -50 }}
    >
      <Defs>
        <RadialGradient id="glow" cx="90%" cy="20%" r="40%">
          <Stop offset="0%" stopColor="#FFFF00" stopOpacity="0.5" />
          <Stop offset="100%" stopColor="#728D1D" stopOpacity="0" />
        </RadialGradient>
        <Filter id="blurFilter" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation="50" />
        </Filter>
      </Defs>
      <Circle
        cx="200"
        cy="300"
        r="300"
        fill="url(#glow)"
        filter="url(#blurFilter)"
      />
    </Svg>
  );
}
