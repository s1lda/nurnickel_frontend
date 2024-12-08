import React from 'react';

interface ProgressCircleProps {
  percentage: number | null;
}

const ProgressCircle: React.FC<ProgressCircleProps> = ({ percentage }) => {
    const radius = 10;
    const strokeWidth = 3;
    const normalizedRadius = radius - strokeWidth * 0.5;
    const circumference = normalizedRadius * 2 * Math.PI;
    
    const progressColor = "#7c3aed";
    const backgroundColor = "#e6e6e6";
    
    const offset = !percentage ? circumference : circumference - ((percentage / 100) * circumference);
  
    return (
      <svg height={radius * 2} width={radius * 2}>
        <circle
          stroke={backgroundColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={progressColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 0.5s ease-in-out',
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%'
          }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
    );
  };

export default ProgressCircle;
