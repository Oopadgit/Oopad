import type { ComponentType, CSSProperties } from 'react';
export const ShaderButtons: ComponentType<{
  variant?: string;
  mode?: 'light' | 'dark';
  hue?: number;
  saturation?: number;
  brightness?: number;
  className?: string;
  style?: CSSProperties;
}>;
