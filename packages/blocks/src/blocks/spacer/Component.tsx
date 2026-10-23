import type { BlockComponentProps } from "../../registry.ts";
import type { SpacerProps } from "./schema.ts";

const HEIGHT_CLASS = { sm: "h-4", md: "h-8", lg: "h-16", xl: "h-24" } as const;

export function SpacerBlock({ props }: BlockComponentProps<SpacerProps>) {
  return <div className={HEIGHT_CLASS[props.height]} aria-hidden="true" />;
}
