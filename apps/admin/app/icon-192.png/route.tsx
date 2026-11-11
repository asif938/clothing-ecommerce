import { ImageResponse } from "next/og";
import { getBrandIdentity } from "../../lib/brand";

/** Admin PWA icon: brand colour + brand initial, generated on the fly (golden rule 1 - no hardcoded brand asset). */
export async function GET() {
  const { name, color } = await getBrandIdentity();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: color, color: "#fff", fontSize: 96, fontWeight: 700 }}>
        {name.charAt(0).toUpperCase()}
      </div>
    ),
    { width: 192, height: 192 },
  );
}
